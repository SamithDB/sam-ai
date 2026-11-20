import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mastra } from '@mastra/core/mastra';
import { createAgentTeam, SUPERVISOR_AGENT_ID, type AgentTeam } from '@sam-ai/agents';
import { createCseTools, createResearchTools } from '@sam-ai/tools';
import type { Env } from '../config/env';
import { CseService } from '../cse/cse.service';
import { ResearchLiveService } from '../research/research-live.service';
import { ResearchService } from '../research/research.service';
import { createCseDataSource, createResearchPort, InMemoryNotifier, InMemoryWatchlistStore } from './agent-ports';

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
    private readonly research: ResearchService,
    private readonly researchLive: ResearchLiveService,
  ) {}

  get isEnabled(): boolean {
    return this.mastraInstance !== undefined;
  }

  get provider(): Env['LLM_PROVIDER'] {
    return this.config.get('LLM_PROVIDER', { infer: true });
  }

  /** Mastra model-router id, e.g. "openai/gpt-5-mini" or "anthropic/claude-haiku-5-5". */
  get model(): string {
    const name =
      this.provider === 'anthropic'
        ? this.config.get('ANTHROPIC_MODEL', { infer: true })
        : this.config.get('OPENAI_MODEL', { infer: true });
    return `${this.provider}/${name}`;
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

    // The Mastra model router reads the key for the chosen provider from process.env.
    const keyVar = this.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    if (!this.config.get(keyVar, { infer: true })) {
      this.logger.warn(`${keyVar} is empty: agent calls will fail until it is set in .env (LLM_PROVIDER=${this.provider})`);
    }

    const tools = createCseTools({
      data: createCseDataSource(this.cse),
      watchlist: this.watchlist,
      notifier: this.notifier,
    });
    const researchTools = createResearchTools(createResearchPort(this.research, this.researchLive));
    const agents = createAgentTeam({ tools, researchTools, model: this.model });

    this.mastraInstance = new Mastra({ agents });
    this.logger.log(`Mastra initialized: ${Object.keys(agents).length} agents (${SUPERVISOR_AGENT_ID}), model ${this.model}`);
  }
}
