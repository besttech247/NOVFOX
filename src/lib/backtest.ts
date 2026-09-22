import type { Candle, ScannerSettings, SymbolMeta } from '@/types'
import type { ExchangeAdapter } from './exchanges'
import { mapPool } from './exchanges/types'
import { evaluateSymbol } from './signals'

export interface BacktestParams {
  days: number
  symbolCount: number
  stopLossPct: number
  takeProfitPct: number
  timeStopCandles: number
  feePct: number // per side, e.g. 0.1 = 0.1%
  slippagePct: number // total round-trip slippage
}

export interface BacktestTrade {
  symbol: string
  base: string
  entryTime: number
  exitTime: number
  entry: number
  exit: number
  pnlPct: number // net of fees + slippage
  reason: 'target' | 'stop' | 'time'
  score: number
  parts: string[]
  holdingCandles: number
}

export interface PartStat {
  key: string
  label: string
  trades: number
  winRate: number
  avgPnl: number
}

export interface BacktestResult {
  trades: BacktestTrade[]
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number | null
  netPnlPct: number
  avgWinPct: number
  avgLossPct: number
  expectancyPct: number
  maxDrawdownPct: number
  equity: number[]
  partStats: PartStat[]
  symbolsTested: number
  candlesTested: number
}

export const DEFAULT_BT_PARAMS: BacktestParams = {
  days: 7,
  symbolCount: 10,
  stopLossPct: 0.5,
  takeProfitPct: 0.75,
  timeStopCandles: 12,
  feePct: 0.1,
  slippagePct: 0.05,
}

const WINDOW = 200
const WARMUP = 60

/** fetch full history via backwards pagination */
async function fetchHistory(
  adapter: ExchangeAdapter,
  symbol: string,
  interval: '1m' | '3m' | '5m',
  totalCandles: number,
): Promise<Candle[]> {
  const stepMs = interval === '1m' ? 60_000 : interval === '3m' ? 180_000 : 300_000
  const perReq = 1000
  const out: Candle[] = []
  let end = Date.now()
  while (out.length < totalCandles) {
    const batch = await adapter.fetchKlinesBefore(symbol, interval, Math.min(perReq, totalCandles - out.length), end)
    if (batch.length === 0) break
    out.unshift(...batch)
    end = batch[0].t - stepMs
    if (batch.length < 2) break
  }
  // dedupe + sort
  const map = new Map<number, Candle>()
  for (const c of out) map.set(c.t, c)
  return [...map.values()].sort((a, b) => a.t - b.t)
}

interface SymbolData {
  meta: SymbolMeta
  c1: Candle[]
  c5: Candle[]
}

function simulateSymbol(data: SymbolData, settings: ScannerSettings, p: BacktestParams): BacktestTrade[] {
  const { c1: candles, c5: trend } = data
  const trades: BacktestTrade[] = []
  const meta: SymbolMeta = { ...data.meta, quoteVol24h: 1e12 } // liquidity unknown historically → pass filter
  const roundTripCostPct = (2 * p.feePct + p.slippagePct) / 100

  // pointer into the 5m trend array (candles sorted by time)
  let ti = 0

  let i = WARMUP
  while (i < candles.length - 1) {
    const ct = candles[i].t
    while (ti + 1 < trend.length && trend[ti + 1].t <= ct) ti++
    const trendWindow = trend.slice(Math.max(0, ti - WINDOW + 1), ti + 1)
    const window = candles.slice(Math.max(0, i - WINDOW + 1), i + 1)

    const scan = evaluateSymbol(meta, window, trendWindow, settings)

    if (scan.strength !== 'none') {
      const entry = candles[i + 1].o
      const stop = entry * (1 - p.stopLossPct / 100)
      const target = entry * (1 + p.takeProfitPct / 100)
      let exit = candles[candles.length - 1].c
      let exitIdx = candles.length - 1
      let reason: BacktestTrade['reason'] = 'time'

      for (let j = i + 1; j < candles.length; j++) {
        const c = candles[j]
        // conservative: if both stop and target touched in one candle, assume stop first
        if (c.l <= stop) {
          exit = stop
          exitIdx = j
          reason = 'stop'
          break
        }
        if (c.h >= target) {
          exit = target
          exitIdx = j
          reason = 'target'
          break
        }
        if (j - i >= p.timeStopCandles) {
          exit = c.c
          exitIdx = j
          reason = 'time'
          break
        }
      }

      const gross = (exit - entry) / entry
      trades.push({
        symbol: data.meta.symbol,
        base: data.meta.base,
        entryTime: candles[i + 1].t,
        exitTime: candles[exitIdx].t,
        entry,
        exit,
        pnlPct: (gross - roundTripCostPct) * 100,
        reason,
        score: scan.score,
        parts: scan.parts.filter((x) => x.points > 0).map((x) => x.label),
        holdingCandles: exitIdx - i,
      })

      i = exitIdx + 1 // no overlapping positions on the same symbol
      continue
    }
    i++
  }
  return trades
}

export function aggregate(
  trades: BacktestTrade[],
  symbolsTested: number,
  candlesTested: number,
): BacktestResult {
  const wins = trades.filter((t) => t.pnlPct > 0)
  const losses = trades.filter((t) => t.pnlPct <= 0)
  const grossWin = wins.reduce((s, t) => s + t.pnlPct, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0))

  // equity curve (simple sum of per-trade pnl)
  const equity: number[] = [0]
  let eq = 0
  let peak = 0
  let maxDd = 0
  for (const t of [...trades].sort((a, b) => a.exitTime - b.exitTime)) {
    eq += t.pnlPct
    equity.push(eq)
    peak = Math.max(peak, eq)
    maxDd = Math.max(maxDd, peak - eq)
  }

  // per-signal-component breakdown
  const partMap = new Map<string, { label: string; pnls: number[] }>()
  for (const t of trades) {
    for (const label of t.parts) {
      const rec = partMap.get(label) ?? { label, pnls: [] }
      rec.pnls.push(t.pnlPct)
      partMap.set(label, rec)
    }
  }
  const partStats: PartStat[] = [...partMap.values()]
    .map((r) => ({
      key: r.label,
      label: r.label,
      trades: r.pnls.length,
      winRate: (r.pnls.filter((x) => x > 0).length / r.pnls.length) * 100,
      avgPnl: r.pnls.reduce((a, b) => a + b, 0) / r.pnls.length,
    }))
    .sort((a, b) => b.trades - a.trades)

  const total = trades.length
  return {
    trades: [...trades].sort((a, b) => b.exitTime - a.exitTime),
    totalTrades: total,
    wins: wins.length,
    losses: losses.length,
    winRate: total ? (wins.length / total) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    netPnlPct: eq,
    avgWinPct: wins.length ? grossWin / wins.length : 0,
    avgLossPct: losses.length ? -grossLoss / losses.length : 0,
    expectancyPct: total ? eq / total : 0,
    maxDrawdownPct: maxDd,
    equity,
    partStats,
    symbolsTested,
    candlesTested,
  }
}

export async function runBacktest(
  adapter: ExchangeAdapter,
  settings: ScannerSettings,
  params: BacktestParams,
  onProgress: (done: number, total: number, label: string) => void,
  isCancelled: () => boolean,
): Promise<BacktestResult> {
  const top = await adapter.fetchTopSymbols(params.symbolCount)
  const candles1m = params.days * 24 * 60
  const candles5m = params.days * 24 * 12

  const datasets: SymbolData[] = []
  let done = 0
  await mapPool(top, 3, async (meta) => {
    if (isCancelled()) return
    try {
      onProgress(done, top.length, meta.base)
      const [c1, c5] = await Promise.all([
        fetchHistory(adapter, meta.symbol, '1m', candles1m),
        fetchHistory(adapter, meta.symbol, '5m', candles5m),
      ])
      if (c1.length > WARMUP + 10) datasets.push({ meta, c1, c5 })
    } catch {
      /* skip symbol on failure */
    }
    done++
    onProgress(done, top.length, meta.base)
  })

  if (isCancelled()) throw new Error('cancelled')

  const allTrades: BacktestTrade[] = []
  let candlesTested = 0
  for (const d of datasets) {
    if (isCancelled()) throw new Error('cancelled')
    candlesTested += d.c1.length
    allTrades.push(...simulateSymbol(d, settings, params))
    await new Promise((r) => setTimeout(r, 0)) // keep UI responsive
  }

  return aggregate(allTrades, datasets.length, candlesTested)
}
