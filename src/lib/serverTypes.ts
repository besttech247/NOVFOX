/**
 * Shape of the engine snapshot sent by the server via /api/state and SSE.
 * Mirrors api/engine.ts EngineSnapshot — keep in sync.
 */
import type { ConnStatus, ExchangeId, MarketType, ScannerSettings, SymbolScan } from '@/types'

export interface EngineSnapshot {
  running: boolean
  exchanges: ExchangeId[]
  markets?: MarketType[]
  market: MarketType
  settings: ScannerSettings
  status: ConnStatus
  connStalled: boolean
  loading: boolean
  error: string | null
  scans: SymbolScan[]
  lastTick: number
  demo: boolean
}

/** one archived signal row from PostgreSQL (createdAt arrives as ISO string over JSON) */
export interface ArchivedSignal {
  id: string
  symbol: string
  base: string
  exchange: string
  market: string
  timeframe: string
  strength: 'strong' | 'normal'
  score: number
  price: number
  rsi: number | null
  relVol: number | null
  fundingRate: number | null
  oiChangePct: number | null
  parts: string[]
  webhookSent: boolean
  createdAt: string
}

/** per-symbol archive stats for the last hour / last 24h — mirrors api/db.ts signalStats() */
export interface SymbolStats {
  base: string
  strong1h: number
  normal1h: number
  strong24h: number
  normal24h: number
  total24h: number
  bestScore24h: number
  lastAt: string | null
}

/** one macro-economic event — mirrors api/news.ts EconEvent */
export interface EconEvent {
  id: string
  title: string
  currency: string
  impact: 'high' | 'medium' | 'low' | 'holiday'
  at: number // unix ms (UTC)
  allDay: boolean
  forecast: string
  previous: string
}

/** one crypto news headline — mirrors api/news.ts NewsItem */
export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  categories: string[]
  at: number // unix ms
}
