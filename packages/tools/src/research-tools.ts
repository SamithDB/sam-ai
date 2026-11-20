import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ModelExplanation, ResearchPort, StockPrediction } from './research-types';
import { symbolInput } from './schemas';

const r3 = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);
const r4 = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10000) / 10000);

function compactExplanation(e: ModelExplanation, topN: number) {
  return {
    model: e.model,
    probUp: r3(e.prob_up),
    baselineProbUp: r3(e.baseline_prob),
    topFeatures: e.features.slice(0, topN).map((f) => ({
      feature: f.feature,
      meaning: f.description,
      group: f.group,
      todayValue: r4(f.value),
      contribution: r4(f.phi),
      pushes: (f.phi ?? 0) >= 0 ? 'up' : 'down',
    })),
    featureGroups: e.groups.map((g) => ({ group: g.group, contribution: r4(g.phi) })),
    timeBlocks: e.time_blocks.map((b) => ({ block: b.block, contribution: r4(b.phi) })),
  };
}

/** Trims a full prediction to what the LLM needs: everything for the recommended model, a summary for the rest. */
export function compactPrediction(p: StockPrediction) {
  const main = p.explanations.find((e) => e.model === p.recommended_model) ?? p.explanations[0];
  return {
    symbol: p.symbol,
    asOf: p.as_of,
    lastClose: p.last_close,
    target: p.target,
    regime: p.regime,
    consensus: { ...p.consensus, prob_up: r3(p.consensus.prob_up) },
    recommendedModel: p.recommended_model,
    models: p.models.map((m) => ({
      model: m.model,
      label: m.label,
      probUp: r3(m.prob_up),
      direction: m.direction,
      seedSpread: r3(m.seed_sd),
      seeds: m.n_seeds,
      outOfSampleBalancedAccuracy: m.oos_balanced_accuracy
        ? { mean: r3(m.oos_balanced_accuracy.mean), ci95: [r3(m.oos_balanced_accuracy.ci_lo), r3(m.oos_balanced_accuracy.ci_hi)] }
        : null,
      beatsChance: m.beats_chance ?? null,
      balancedAccuracyInCurrentRegime: r3(m.regime_balanced_accuracy),
      testDaysInCurrentRegime: m.regime_n ?? null,
      balancedAccuracyOnThisStock: r3(m.symbol_balanced_accuracy),
      historicalAccuracyAtThisConfidence: m.confidence_bucket
        ? {
            confidenceRange: `|P(up)-0.5| in [${m.confidence_bucket.lo}, ${m.confidence_bucket.hi})`,
            accuracy: r3(m.confidence_bucket.accuracy),
            n: m.confidence_bucket.n,
          }
        : null,
    })),
    explanation: main ? compactExplanation(main, 8) : null,
    otherModelsTopFeatures: p.explanations
      .filter((e) => e !== main)
      .map((e) => ({ model: e.model, top3: e.features.slice(0, 3).map((f) => `${f.feature} (${(f.phi ?? 0) >= 0 ? '+' : ''}${r4(f.phi)})`) })),
    explanationReliability: {
      byModel: Object.fromEntries(
        Object.entries(p.reliability.by_model).map(([k, v]) => [
          k,
          {
            seedStability: r3(v.seed_stability),
            temporalStability: r3(v.temporal_stability),
            robustness: r3(v.robustness),
            faithfulnessRatio: r3(v.faithfulness_ratio),
          },
        ]),
      ),
      modelAgreement: r3(p.reliability.model_agreement),
    },
    caveats: p.caveats,
  };
}

export function createResearchTools(research: ResearchPort) {
  const stockPrediction = createTool({
    id: 'research-stock-prediction',
    description:
      'Next-trading-day direction prediction for one CSE stock from the MSc research models (LR, Random Forest, LSTM, ' +
      'PatchTST), with per-model probabilities, out-of-sample evaluation, the current market regime, a Shapley-value ' +
      'explanation, explanation-reliability scores (stability, robustness, faithfulness) and caveats.',
    inputSchema: z.object({ symbol: symbolInput }),
    execute: async ({ symbol }) => {
      const res = await research.getPrediction(symbol);
      return { generatedAt: res.created_at, data: res.data, methods: res.methods, prediction: compactPrediction(res.prediction) };
    },
  });

  const predictionsOverview = createTool({
    id: 'research-predictions-overview',
    description:
      'Latest next-day direction predictions for every stock in the research universe (consensus probability, ' +
      'recommended model, regime) plus each model\'s overall out-of-sample balanced accuracy.',
    inputSchema: z.object({}),
    execute: async () => {
      const res = await research.listPredictions();
      return {
        generatedAt: res.created_at,
        asOf: res.as_of,
        data: res.data,
        recommendedModel: res.recommended_model,
        modelEvaluation: Object.fromEntries(
          Object.entries(res.evaluation).map(([m, e]) => [
            m,
            { balancedAccuracy: r3(e.balanced_accuracy.mean), ci95: [r3(e.balanced_accuracy.ci_lo), r3(e.balanced_accuracy.ci_hi)], beatsChance: e.beats_chance, nTest: e.n_test },
          ]),
        ),
        predictions: res.predictions.map((p) => ({
          symbol: p.symbol,
          asOf: p.as_of,
          regime: p.regime.label,
          consensusProbUp: r3(p.consensus.prob_up),
          consensusDirection: p.consensus.direction,
          modelsUp: `${p.consensus.models_up}/${p.consensus.n_models}`,
          recommendedModelProbUp: r3(p.recommended?.prob_up),
        })),
      };
    },
  });

  const modelEvaluation = createTool({
    id: 'research-model-evaluation',
    description:
      'Walk-forward (out-of-sample) evaluation results of the research experiments. Without a name: list experiments ' +
      '(all on real cse.lk data) with their best model. With a name: per-model balanced accuracy, MCC, ' +
      'macro-F1 with 95% block-bootstrap CIs, and balanced accuracy by market regime.',
    inputSchema: z.object({
      experiment: z.string().trim().optional().describe('Experiment name from the list, e.g. "dev_1y_db". Omit to list.'),
    }),
    execute: async ({ experiment }) => {
      if (!experiment) {
        return { experiments: await research.listExperiments() };
      }
      const s = await research.getExperiment(experiment);
      return {
        name: s.name,
        kind: s.kind,
        data: s.data,
        metrics: s.metrics.map((m) => ({
          model: m.model,
          nTest: m.n_test,
          balancedAccuracy: { mean: r3(m.balanced_accuracy.mean), ci95: [r3(m.balanced_accuracy.ci_lo), r3(m.balanced_accuracy.ci_hi)] },
          mcc: { mean: r3(m.mcc.mean), ci95: [r3(m.mcc.ci_lo), r3(m.mcc.ci_hi)] },
          macroF1: r3(m.macro_f1.mean),
          beatsChance: (m.balanced_accuracy.ci_lo ?? 0) > 0.5,
        })),
        byRegime: s.by_regime.map((b) => ({ model: b.model, regime: b.regime ?? b.key, n: b.n, balancedAccuracy: r3(b.balanced_accuracy) })),
      };
    },
  });

  const dataStatus = createTool({
    id: 'research-data-status',
    description:
      'What research data is stored in the database (per-stock and index coverage, date range), when predictions were ' +
      'last built, whether they are stale, and the latest sync job. Use when asked about data freshness or coverage.',
    inputSchema: z.object({}),
    execute: async () => research.getDataStatus(),
  });

  return { stockPrediction, predictionsOverview, modelEvaluation, dataStatus };
}

export type ResearchTools = ReturnType<typeof createResearchTools>;
