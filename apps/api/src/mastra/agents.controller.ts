import { Body, Controller, Get, Headers, Logger, Post, Res, ServiceUnavailableException } from '@nestjs/common';
import { handleChatStream } from '@mastra/ai-sdk';
import { RequestContext } from '@mastra/core/request-context';
import { ANONYMOUS_USER_ID, USER_ID_CONTEXT_KEY } from '@sam-ai/tools';
import { pipeUIMessageStreamToResponse, type UIMessage } from 'ai';
import type { Response } from 'express';
import { MastraService, SUPERVISOR_AGENT_NAME } from './mastra.service';

interface ChatRequestBody {
  messages: UIMessage[];
  trigger?: 'submit-message' | 'regenerate-message';
}

/** Max model/tool steps per chat turn, so a confused agent cannot loop forever. */
const MAX_STEPS = 12;

const userIdFrom = (header: string | undefined) => header?.trim() || ANONYMOUS_USER_ID;

@Controller()
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(private readonly mastraService: MastraService) {}

  @Get('agents/status')
  getStatus() {
    if (!this.mastraService.isEnabled) {
      return { enabled: false, model: null, agents: [] };
    }
    const agents = Object.entries(this.mastraService.mastra.listAgents()).map(([name, agent]) => ({
      name,
      id: agent.id,
      displayName: agent.name,
    }));
    return { enabled: true, model: this.mastraService.model, agents };
  }

  /**
   * Streams a supervisor-agent reply in the AI SDK v6 UI-message format,
   * consumable by `useChat` from `@ai-sdk/react`.
   */
  @Post('chat')
  async chat(
    @Body() body: ChatRequestBody,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Res() res: Response,
  ) {
    if (!this.mastraService.isEnabled) {
      throw new ServiceUnavailableException('The AI assistant is disabled. Set MASTRA_ENABLED=true in .env.');
    }

    const requestContext = new RequestContext();
    requestContext.set(USER_ID_CONTEXT_KEY, userIdFrom(userIdHeader));

    const stream = await handleChatStream({
      mastra: this.mastraService.mastra,
      agentId: SUPERVISOR_AGENT_NAME,
      version: 'v6',
      params: { messages: body.messages ?? [], trigger: body.trigger, requestContext, maxSteps: MAX_STEPS },
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Chat stream failed: ${message}`);
        // Surface the provider's reason (e.g. no credits, invalid key) instead of a generic hint.
        return `The assistant hit an error: ${message.slice(0, 300)}`;
      },
    });

    await pipeUIMessageStreamToResponse({ response: res, stream });
  }

  @Get('watchlist')
  getWatchlist(@Headers('x-user-id') userIdHeader: string | undefined) {
    return this.mastraService.watchlist.list(userIdFrom(userIdHeader));
  }

  @Get('notifications')
  getNotifications(@Headers('x-user-id') userIdHeader: string | undefined) {
    return this.mastraService.notifier.list(userIdFrom(userIdHeader));
  }
}
