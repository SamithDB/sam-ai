import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { Model, Schema } from 'mongoose';
import type { Env } from '../config/env';

const securityMasterSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true },
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

/**
 * Owns the MongoDB connection and the ingestion-layer models.
 * Connection is non-blocking: the API still boots (on fixture data) when Mongo is down.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  readonly SecurityMaster: Model<any> =
    mongoose.models.CseSecurityMaster ?? mongoose.model('CseSecurityMaster', securityMasterSchema);
  readonly CompanySnapshot: Model<any> =
    mongoose.models.CseCompanySnapshot ?? mongoose.model('CseCompanySnapshot', companySnapshotSchema);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  onModuleInit() {
    const mongoUri = this.config.get('MONGO_URI', { infer: true });
    this.logger.log(`Connecting to MongoDB at ${mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);

    mongoose
      .connect(mongoUri, { autoIndex: true, serverSelectionTimeoutMS: 5000 })
      .then(() => this.logger.log('MongoDB connected'))
      .catch((err) => this.logger.warn(`MongoDB connect failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  async onModuleDestroy() {
    await mongoose.disconnect().catch((err) => this.logger.warn(`MongoDB disconnect error: ${String(err)}`));
  }
}
