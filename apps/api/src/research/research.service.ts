import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { Env } from '../config/env';
import {
  RESEARCH_SCHEMA_VERSION,
  type ExperimentListItem,
  type ExperimentSummary,
} from './research.types';

/** Experiment folder names produced by the pipeline: letters, digits, `_`, `-`, `.`. Blocks path traversal. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * Read-only access to research results written by the Python pipeline
 * (`research/results/<experiment>/summary.json`). Files are re-read on every request,
 * so a new pipeline run shows up without restarting the API.
 */
@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);
  readonly resultsDir: string;

  constructor(config: ConfigService<Env, true>) {
    const dir = config.get('RESEARCH_RESULTS_DIR', { infer: true });
    this.resultsDir = isAbsolute(dir) ? dir : join(process.cwd(), dir);
  }

  async listExperiments(): Promise<ExperimentListItem[]> {
    let entries: string[];
    try {
      entries = (await readdir(this.resultsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && SAFE_NAME.test(e.name))
        .map((e) => e.name);
    } catch {
      this.logger.warn(`Research results folder not found: ${this.resultsDir}`);
      return [];
    }

    const items: ExperimentListItem[] = [];
    for (const name of entries) {
      const summary = await this.readSummary(name).catch(() => null);
      if (!summary) continue;
      items.push(this.toListItem(summary));
    }
    // Real-data experiments first, newest first.
    return items.sort((a, b) =>
      a.kind === b.kind ? b.created_at.localeCompare(a.created_at) : a.kind === 'real' ? -1 : 1,
    );
  }

  async getExperiment(name: string): Promise<ExperimentSummary> {
    if (!SAFE_NAME.test(name)) {
      throw new NotFoundException(`Unknown experiment: ${name}`);
    }
    const summary = await this.readSummary(name).catch(() => null);
    if (!summary) {
      throw new NotFoundException(
        `No summary.json for experiment "${name}". Run research/scripts/run_experiment.py or export_results.py.`,
      );
    }
    return summary;
  }

  private async readSummary(name: string): Promise<ExperimentSummary> {
    const raw = await readFile(join(this.resultsDir, name, 'summary.json'), 'utf-8');
    const summary = JSON.parse(raw) as ExperimentSummary;
    if (summary.schema_version !== RESEARCH_SCHEMA_VERSION) {
      this.logger.warn(
        `${name}/summary.json has schema_version ${summary.schema_version}, expected ${RESEARCH_SCHEMA_VERSION}`,
      );
    }
    return summary;
  }

  private toListItem(s: ExperimentSummary): ExperimentListItem {
    const best = [...s.metrics].sort((a, b) => b.balanced_accuracy.mean - a.balanced_accuracy.mean)[0];
    return {
      name: s.name,
      kind: s.kind,
      created_at: s.created_at,
      test_start: s.data.test_start,
      test_end: s.data.test_end,
      n_test: s.data.n_test,
      models: s.models.map((m) => m.id),
      best: best
        ? {
            model: best.model,
            balanced_accuracy: best.balanced_accuracy.mean,
            beats_chance: best.balanced_accuracy.ci_lo > 0.5,
          }
        : null,
    };
  }
}
