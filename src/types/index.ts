export type ExchangeId = 'binance' | 'bybit' | 'kucoin' | 'okx' | 'kraken' | 'coinbase' | 'hyperliquid'
export type Timeframe = '1m' | '5m'
export type MarketType = 'spot' | 'futures'

export interface Candle {
  t: number // open time (ms)
  o: number
  h: number
  l: number
  c: number
  v: number
  closed: boolean
}

export interface SymbolMeta {
  symbol: string // canonical exchange symbol, e.g. BTCUSDT / BTC-USDT
  base: string // e.g. BTC
  exchange: ExchangeId // which exchange this symbol belongs to
  market: MarketType // 'spot' or 'futures'
  quoteVol24h: number // in USD
  price: number
  change24h: number // percent
  /** Daily Open price at 00:00 UTC */
  openDaily?: number | null
  /** Percent change from Daily Open (00:00 UTC) */
  changeDaily?: number | null
  /** futures-only metrics, in percent units (0.01 = 0.01%) */
  fundingRate?: number | null
  /** futures-only: open-interest change over ~15min, percent */
  oiChangePct?: number | null
}

export interface SignalPart {
  key: string
  label: string
  points: number
}

export type SignalStrength = 'strong' | 'normal' | 'none'

export interface SymbolScan {
  meta: SymbolMeta
  score: number
  strength: SignalStrength
  parts: SignalPart[]
  rsi: number | null
  relVol: number | null
  atrPct: number | null
  vwapDistPct: number | null
  trendUp: boolean
  passesFilters: boolean
  filterReasons: string[]
  spark: number[]
  vwapSpark: number[]
  updatedAt: number
}

export interface AlertItem {
  id: string
  symbol: string
  base: string
  exchange: ExchangeId
  market?: MarketType
  timeframe: Timeframe
  score: number
  strength: 'strong' | 'normal'
  price: number
  parts: string[]
  time: number
}

export interface ScannerSettings {
  symbolCount: number
  primaryTf: Timeframe
  strongThreshold: number
  normalThreshold: number
  minQuoteVolM: number // minimum 24h quote volume, in millions USD
  volSpikeX: number // volume spike multiplier for full points
  cooldownMin: number // alert cooldown per symbol, minutes
  sound: boolean // client-side alert beep (off by default)
  tickMs: number // server compute/broadcast interval, ms
  refreshSec: number // server ticker + funding/OI refresh interval, seconds
  webhookUrl: string // custom webhook endpoint (POST JSON) — empty = disabled
  webhookOn: boolean // auto-send every fresh signal to the webhook
  hideTradFi?: boolean // optional filter to hide metals, oil, and stocks
  hideLending?: boolean // optional filter to hide DeFi lending tokens
  hideGambling?: boolean // optional filter to hide Gambling/Casino tokens
  indicators: Record<IndicatorKey, boolean> // per-indicator on/off switches
}

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error'

/** toggleable scoring components — each can be switched off from settings */
export type IndicatorKey = 'ema' | 'vwap' | 'rsi' | 'volume' | 'trend' | 'breakout' | 'oi' | 'funding'

export const INDICATOR_LIST: Array<{ key: IndicatorKey; label: string }> = [
  { key: 'ema', label: 'زخم EMA' },
  { key: 'vwap', label: 'VWAP' },
  { key: 'rsi', label: 'RSI' },
  { key: 'volume', label: 'انفجار الحجم' },
  { key: 'trend', label: 'الاتجاه العام' },
  { key: 'breakout', label: 'الكسر السعري' },
  { key: 'oi', label: 'زخم OI' },
  { key: 'funding', label: 'Funding' },
]

export const DEFAULT_SETTINGS: ScannerSettings = {
  symbolCount: 30,
  primaryTf: '1m',
  strongThreshold: 75,
  normalThreshold: 60,
  minQuoteVolM: 3,
  volSpikeX: 3,
  cooldownMin: 3,
  sound: false,
  tickMs: 1000,
  refreshSec: 60,
  webhookUrl: '',
  webhookOn: false,
  hideTradFi: false,
  hideLending: false,
  hideGambling: false,
  indicators: {
    ema: true,
    vwap: true,
    rsi: true,
    volume: true,
    trend: true,
    breakout: true,
    oi: true,
    funding: true,
  },
}

export interface DisplayFilters {
  hideMetals: boolean
  hideOil: boolean
  hideStocks: boolean
  hideLending: boolean
  hideGambling: boolean
  minScore: number
  strength: 'all' | 'strong'
  direction: 'all' | 'long' | 'short'
}

export const DEFAULT_DISPLAY_FILTERS: DisplayFilters = {
  hideMetals: false,
  hideOil: false,
  hideStocks: false,
  hideLending: false,
  hideGambling: false,
  minScore: 0,
  strength: 'all',
  direction: 'all',
}

