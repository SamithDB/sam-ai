import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mastra } from '@mastra/core/mastra';
import { createAgentTeam, SUPERVISOR_AGENT_ID, type AgentTeam } from '@sam-ai/agents';
import { createCseTools } from '@sam-ai/tools';
import type { Env } from '../config/env';
import { CseService } from '../cse/cse.service';
import { createCseDataSource, InMemoryNotifier, InMemoryWatchlistStore } from './agent-ports';

/** Name the supervisor is registered under in `new Mastra({ agents })`. */
export const SUPERVISOR_AGENT_NAME = 'supervisorAgent' satisfies keyof AgentTeam;

/**
 * Hosts the Mastra runtime and the CSE agent team.
 * Agents are only created when MASTRA_ENABLED=true, so the API keeps working without LLM credentials.
 * The watchlist and notification stores always exist so their REST endpoints work either way.
 */
@Injectable()
export class MastraService implements OnModuleInit {
  private readonly logger = new Logger(MastraService.name);
  private mastraInstance?: Mastra;

  readonly watchlist = new InMemoryWatchlistStore();
  readonly notifier = new InMemoryNotifier();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly cse: CseService,
  ) {}

  get isEnabled(): boolean {
    return this.mastraInstance !== undefined;
  }

  get model(): string {
    return this.config.get('MASTRA_MODEL', { infer: true });
  }

  /** The Mastra instance; throws when Mastra is disabled. Check `isEnabled` first. */
  get mastra(): Mastra {
    if (!this.mastraInstance) {
      throw new Error('Mastra is disabled. Set MASTRA_ENABLED=true in .env.');
    }
    return this.mastraInstance;
  }

  onModuleInit() {
    if (!this.config.get('MASTRA_ENABLED', { infer: true })) {
      this.logger.log('Mastra disabled (set MASTRA_ENABLED=true in .env to enable the agents)');
      return;
    }

    if (this.model.startsWith('openai/') && !this.config.get('OPENAI_API_KEY', { infer: true })) {
      this.logger.warn('OPENAI_API_KEY is empty: agent calls will fail until it is set in .env');
    }

    const tools = createCseTools({
      data: createCseDataSource(this.cse),
      watchlist: this.watchlist,
      notifier: this.notifier,
    });
    const agents = createAgentTeam({ tools, model: this.model });

    this.mastraInstance = new Mastra({ agents });
    this.logger.log(`Mastra initialized: ${Object.keys(agents).length} agents (${SUPERVISOR_AGENT_ID}), model ${this.model}`);
  }
}
