import type { CseHistoricalBar } from './domain';

/** Pure technical-indicator helpers. No I/O, so they are easy to unit test. */

export type Trend = 'uptrend' | 'downtrend' | 'sideways';

export interface TechnicalSummary {
  barsAnalyzed: number;
  lastClose: number;
  sma5: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  change5dPercent: number | null;
  change20dPercent: number | null;
  avgDailyRangePercent: number | null;
  trend: Trend;
  /** 0-100. 50 is neutral; built from trend alignment, RSI and recent returns. */
  momentumScore: number;
  signals: string[];
  risks: string[];
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const window = values.slice(-period);
  return round(window.reduce((sum, v) => sum + v, 0) / period);
}

/** Wilder's RSI. Returns null when there are not enough bars. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return round(100 - 100 / (1 + avgGain / avgLoss));
}

export function percentChange(from: number, to: number): number {
  return from === 0 ? 0 : round(((to - from) / from) * 100);
}

function changeOver(closes: number[], bars: number): number | null {
  if (closes.length <= bars) return null;
  return percentChange(closes[closes.length - 1 - bars], closes[closes.length - 1]);
}

export function analyzeBars(bars: CseHistoricalBar[]): TechnicalSummary {
  const sorted = [...bars].sort((a, b) => a.barDate.localeCompare(b.barDate));
  const closes = sorted.map((bar) => bar.closePrice);
  const lastClose = closes.at(-1) ?? 0;

  const sma5 = sma(closes, 5);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const change5dPercent = changeOver(closes, 5);
  const change20dPercent = changeOver(closes, 20);
  // Only bars where the source published both high and low; missing values are skipped, never filled in.
  const ranged = sorted.filter((bar) => bar.highPrice !== null && bar.lowPrice !== null && bar.closePrice > 0);
  const avgDailyRangePercent = ranged.length
    ? round(ranged.reduce((sum, bar) => sum + (((bar.highPrice as number) - (bar.lowPrice as number)) / bar.closePrice) * 100, 0) / ranged.length)
    : null;

  let trend: Trend = 'sideways';
  if (sma5 !== null && sma20 !== null) {
    const spread = percentChange(sma20, sma5);
    if (lastClose > sma20 && spread > 0.5) trend = 'uptrend';
    else if (lastClose < sma20 && spread < -0.5) trend = 'downtrend';
  }

  const signals: string[] = [];
  const risks: string[] = [];
  let score = 50;

  if (sma20 !== null) {
    if (lastClose > sma20) {
      score += 10;
      signals.push(`Price (${lastClose}) is above its 20-day average (${sma20}).`);
    } else {
      score -= 10;
      risks.push(`Price (${lastClose}) is below its 20-day average (${sma20}).`);
    }
  }
  if (sma5 !== null && sma20 !== null) {
    if (sma5 > sma20) {
      score += 10;
      signals.push('5-day average is above the 20-day average (short-term strength).');
    } else {
      score -= 10;
      risks.push('5-day average is below the 20-day average (short-term weakness).');
    }
  }
  if (rsi14 !== null) {
    if (rsi14 >= 70) {
      score += 5;
      risks.push(`RSI(14) is ${rsi14}, in overbought territory; pullback risk is elevated.`);
    } else if (rsi14 <= 30) {
      score -= 5;
      risks.push(`RSI(14) is ${rsi14}, in oversold territory; selling pressure has been heavy.`);
    } else {
      score += rsi14 >= 50 ? 5 : -5;
      (rsi14 >= 50 ? signals : risks).push(`RSI(14) is ${rsi14} (${rsi14 >= 50 ? 'bullish' : 'bearish'} side of neutral).`);
    }
  }
  if (change20dPercent !== null) {
    score += Math.max(-15, Math.min(15, change20dPercent * 1.5));
  }

  return {
    barsAnalyzed: sorted.length,
    lastClose,
    sma5,
    sma20,
    sma50,
    rsi14,
    change5dPercent,
    change20dPercent,
    avgDailyRangePercent,
    trend,
    momentumScore: Math.round(Math.max(0, Math.min(100, score))),
    signals,
    risks,
  };
}
