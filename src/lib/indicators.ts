import type { Candle } from '@/types'

/** Exponential Moving Average — returns array aligned with input (first values seed from SMA) */
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Simple Moving Average */
export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** Wilder RSI — aligned with closes */
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

/** Average True Range — aligned with candles */
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN)
  if (candles.length <= period) return out
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const pc = candles[i - 1].c
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)))
  }
  let sum = 0
  for (let i = 0; i < period; i++) sum += trs[i]
  let prev = sum / period
  out[period] = prev
  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period
    out[i + 1] = prev
  }
  return out
}

/** Rolling VWAP over `period` candles using typical price */
export function rollingVwap(candles: Candle[], period = 100): number[] {
  const out: number[] = new Array(candles.length).fill(NaN)
  let pv = 0
  let vv = 0
  const pvs: number[] = []
  const vvs: number[] = []
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const tp = (c.h + c.l + c.c) / 3
    const p = tp * c.v
    pvs.push(p)
    vvs.push(c.v)
    pv += p
    vv += c.v
    if (i >= period) {
      pv -= pvs[i - period]
      vv -= vvs[i - period]
    }
    if (i >= period - 1) out[i] = vv === 0 ? NaN : pv / vv
  }
  return out
}

/** Relative volume of last candle vs SMA of previous `period` candles */
export function relativeVolume(volumes: number[], period = 20): number | null {
  const n = volumes.length
  if (n < period + 1) return null
  let sum = 0
  for (let i = n - period - 1; i < n - 1; i++) sum += volumes[i]
  const avg = sum / period
  if (avg === 0) return null
  return volumes[n - 1] / avg
}

/** Highest high of the `period` candles preceding index `i` (exclusive) */
export function priorHigh(candles: Candle[], i: number, period: number): number {
  let max = -Infinity
  for (let j = Math.max(0, i - period); j < i; j++) max = Math.max(max, candles[j].h)
  return max
}
