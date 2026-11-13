import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mongoose, { Schema, Model } from 'mongoose';
// Defer importing Mastra to runtime to avoid forcing ESM-only deps at module load
type AnyAgent = { id?: string; [k: string]: any };

@Injectable()
export class MastraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MastraService.name);
  public mastra: any;
  public supervisorAgent?: AnyAgent;

  // mongoose models
  public SecurityMasterModel?: Model<any>;
  public CompanySnapshotModel?: Model<any>;

  constructor() {
    // Only initialize Mastra if explicitly enabled. Many Mastra packages are
    // ESM-only and can cause runtime failures in the dev server when required
    // eagerly. Guard initialization behind an env var for now.
    if (process.env.MASTRA_ENABLED === 'true') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Mastra } = require('@mastra/core/mastra');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Agent } = require('@mastra/core/agent');
        this.mastra = new Mastra({});
      } catch (err) {
        this.logger.warn('Mastra initialization skipped: ' + String(err));
      }
    }
  }

  async onModuleInit() {
    const mongoUri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/sam-ai';
    this.logger.log(`Connecting mongoose -> ${mongoUri}`);

    // Connect without blocking application bootstrap. If Mongo isn't available
    // the app will continue to start and models are still defined.
    mongoose
      .connect(mongoUri, {
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      })
      .then(() => this.logger.log('Mongoose connected'))
      .catch((err) => this.logger.warn('Mongoose connect failed: ' + String(err)));

    // define minimal schemas used by the ingestion layer
    const securityMasterSchema = new Schema(
      {
        symbol: { type: String, required: true, index: true, unique: true },
        companyId: String,
        companyName: String,
        sectorName: String,
        instrumentType: String,
        isActive: { type: Boolean, default: true },
        sourcePayloadJson: Schema.Types.Mixed,
        lastSyncedAt: Date,
      },
      { timestamps: true },
    );

    const companySnapshotSchema = new Schema(
      {
        symbol: { type: String, required: true, index: true },
        tradedDate: Date,
        lastTradedPrice: Number,
        previousClose: Number,
        openPrice: Number,
        highPrice: Number,
        lowPrice: Number,
        changeValue: Number,
        changePercent: Number,
        volume: Number,
        turnover: Number,
        marketCap: Number,
        sourcePayloadJson: Schema.Types.Mixed,
        fetchedAt: Date,
      },
      { timestamps: true },
    );

    this.SecurityMasterModel = mongoose.models.CseSecurityMaster || mongoose.model('CseSecurityMaster', securityMasterSchema);
    this.CompanySnapshotModel = mongoose.models.CseCompanySnapshot || mongoose.model('CseCompanySnapshot', companySnapshotSchema);

    // register a minimal supervisor agent now so other modules can call it
    if (this.mastra) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Agent } = require('@mastra/core/agent');
        this.supervisorAgent = new Agent({
          id: 'supervisor-agent',
          name: 'Supervisor Agent',
          instructions: `You are the supervisor agent. Delegate analysis tasks to specialist agents and combine results into a structured report. Always respond in JSON with the keys: summary, signals, risks, conclusion.`,
          model: process.env.MASTRA_MODEL ?? 'openai/gpt-5-mini',
          tools: {},
        }) as AnyAgent;

        // register on the Mastra instance — optional, Mastra will manage agents when needed
        try {
          // @ts-expect-error runtime registration may exist depending on Mastra version
          this.mastra.registerAgent?.(this.supervisorAgent);
        } catch {}

        this.logger.log('Supervisor agent created');
      } catch (err) {
        this.logger.warn('Failed to create supervisor agent: ' + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      this.logger.log('Mastra not initialized; skipping supervisor agent creation');
    }
  }

  async onModuleDestroy() {
    try {
      await mongoose.disconnect();
      this.logger.log('Mongoose disconnected');
    } catch (err) {
      this.logger.warn('Error during mongoose disconnect: ' + String(err));
    }
  }
}

export default MastraService;
