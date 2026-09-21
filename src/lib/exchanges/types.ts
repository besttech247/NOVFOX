import type { Candle, ConnStatus, ExchangeId, MarketType, SymbolMeta, Timeframe } from '@/types'

export interface KlineEvent {
  symbol: string
  interval: Timeframe
  candle: Candle
}

export interface FuturesMetrics {
  fundingRate?: number | null // percent, e.g. 0.01 = 0.01%
  openInterest?: number | null // raw contracts/coins
}

export interface ExchangeAdapter {
  id: ExchangeId
  name: string
  market: MarketType
  fetchTopSymbols(limit: number): Promise<SymbolMeta[]>
  fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]>
  /** paginated history: klines ending before endTimeMs (for backtesting) */
  fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]>
  /** futures adapters only: funding + open interest snapshot */
  fetchFuturesMetrics?: (symbols: string[]) => Promise<Map<string, FuturesMetrics>>
  subscribe(
    symbols: string[],
    intervals: Timeframe[],
    onKline: (ev: KlineEvent) => void,
    onStatus?: (s: ConnStatus) => void,
  ): () => void
}

/** Bases we never scan (stablecoins, fiat, dead pegs) */
export const EXCLUDED_BASES = new Set([
  'USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'PAX', 'USD1', 'USDD', 'USDE',
  'EUR', 'GBP', 'TRY', 'BRL', 'AUD', 'JPY', 'RUB', 'ARS', 'NGN', 'UAH', 'ZAR',
  'AEUR', 'EURI', 'XUSD', 'PYUSD', 'GUSD', 'LUSD', 'FRAX', 'USTC', 'USDS',
])

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as T
}

/** Run async tasks with bounded concurrency */
export async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return out
}

/** Generic WS reconnect wrapper supporting async socket factories, with exponential backoff */
export function withReconnect(
  connect: () => WebSocket | Promise<WebSocket>,
  onStatus: ((s: ConnStatus) => void) | undefined,
  isStopped: () => boolean,
): () => void {
  let ws: WebSocket | null = null
  let retries = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const open = async () => {
    if (isStopped()) return
    onStatus?.(retries > 0 ? 'reconnecting' : 'connecting')
    try {
      ws = await connect()
    } catch {
      if (isStopped()) return
      retries++
      timer = setTimeout(() => void open(), Math.min(15000, 1000 * 2 ** retries))
      return
    }
    if (isStopped()) {
      ws.close()
      return
    }
    ws.addEventListener('open', () => {
      retries = 0
      onStatus?.('open')
    })
    ws.addEventListener('close', () => {
      if (isStopped()) return
      retries++
      timer = setTimeout(() => void open(), Math.min(15000, 1000 * 2 ** retries))
    })
    ws.addEventListener('error', () => ws?.close())
  }
  void open()

  return () => {
    if (timer) clearTimeout(timer)
    ws?.close()
  }
}
