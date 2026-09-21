import type { Candle, MarketType, SymbolMeta, Timeframe } from '@/types'
import { EXCLUDED_BASES, fetchJson, mapPool, withReconnect, type ExchangeAdapter, type FuturesMetrics } from './types'

const REST_SPOT = 'https://api.kucoin.com'
const REST_FUTURES = 'https://api-futures.kucoin.com'

const TF_MAP: Record<Timeframe, string> = { '1m': '1min', '5m': '5min' }
const TF_GRANULARITY: Record<Timeframe, number> = { '1m': 1, '5m': 5 }

interface KucoinTicker {
  symbol: string // BTC-USDT
  last: string
  volValue: string
  changeRate: string
}

interface KucoinContract {
  symbol: string // XBTUSDTM
  baseCurrency: string // XBT
  quoteCurrency: string
  markPrice: number
  lastPrice?: number
  volume24h?: number
  turnover24h?: number
  openInterest?: string | number
  fundingFeeRate?: number
  priceChgPct?: number
}

interface BulletResponse {
  data: {
    token: string
    instanceServers: Array<{ endpoint: string; pingInterval: number; pingTimeout: number }>
  }
}

interface KucoinKlineMsg {
  type?: string
  topic?: string
  data?: {
    symbol: string
    candles: string[] // [time(sec), open, close, high, low, volume, turnover]
  }
}

function normBase(base: string): string {
  return base === 'XBT' ? 'BTC' : base
}

function normTs(t: number): number {
  return t < 1e11 ? t * 1000 : t // seconds → ms
}

function makeKucoin(market: MarketType): ExchangeAdapter {
  const isF = market === 'futures'
  const REST = isF ? REST_FUTURES : REST_SPOT

  const fetchContracts = async () =>
    (await fetchJson<{ data: KucoinContract[] }>(`${REST}/api/v1/contracts/active`)).data

  const self: ExchangeAdapter = {
    id: 'kucoin',
    name: 'KuCoin',
    market,

    async fetchTopSymbols(limit: number): Promise<SymbolMeta[]> {
      if (isF) {
        const contracts = await fetchContracts()
        return contracts
          .filter((c) => c.symbol.endsWith('USDTM') && c.quoteCurrency === 'USDT')
          .map((c) => {
            const price = c.lastPrice ?? c.markPrice ?? 0
            const quoteVol = c.turnover24h ?? (c.volume24h ?? 0) * price
            return {
              symbol: c.symbol,
              base: normBase(c.baseCurrency),
              quoteVol24h: quoteVol,
              price,
              change24h: (c.priceChgPct ?? 0) * 100,
            }
          })
          .filter((m) => !EXCLUDED_BASES.has(m.base) && isFinite(m.price) && m.price > 0 && m.quoteVol24h > 0)
          .sort((a, b) => b.quoteVol24h - a.quoteVol24h)
          .slice(0, limit)
      }

      const res = await fetchJson<{ data: { ticker: KucoinTicker[] } }>(`${REST}/api/v1/market/allTickers`)
      return res.data.ticker
        .filter((t) => t.symbol.endsWith('-USDT'))
        .map((t) => ({
          symbol: t.symbol,
          base: t.symbol.slice(0, -5),
          quoteVol24h: parseFloat(t.volValue),
          price: parseFloat(t.last),
          change24h: parseFloat(t.changeRate) * 100,
        }))
        .filter((m) => !EXCLUDED_BASES.has(m.base) && isFinite(m.price) && m.price > 0)
        .sort((a, b) => b.quoteVol24h - a.quoteVol24h)
        .slice(0, limit)
    },

    async fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]> {
      if (isF) {
        const res = await fetchJson<{ data: unknown[][] }>(
          `${REST}/api/v1/kline/query?symbol=${symbol}&granularity=${TF_GRANULARITY[interval]}`,
        )
        // futures klines: [time, open, high, low, close, volume] — newest first
        return res.data
          .slice(0, limit)
          .map((k) => ({
            t: normTs(Number(k[0])),
            o: parseFloat(k[1] as string),
            h: parseFloat(k[2] as string),
            l: parseFloat(k[3] as string),
            c: parseFloat(k[4] as string),
            v: parseFloat(k[5] as string),
            closed: true,
          }))
          .reverse()
      }

      const res = await fetchJson<{ data: string[][] }>(
        `${REST}/api/v1/market/candles?type=${TF_MAP[interval]}&symbol=${symbol}`,
      )
      // spot candles: [time, open, close, high, low, volume, turnover] — newest first
      return res.data
        .slice(0, limit)
        .map((k) => ({
          t: parseInt(k[0], 10) * 1000,
          o: parseFloat(k[1]),
          h: parseFloat(k[3]),
          l: parseFloat(k[4]),
          c: parseFloat(k[2]),
          v: parseFloat(k[5]),
          closed: true,
        }))
        .reverse()
    },

    async fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]> {
      if (isF) {
        const granMs = TF_GRANULARITY[interval] * 60_000
        const from = endTimeMs - limit * granMs
        const res = await fetchJson<{ data: unknown[][] }>(
          `${REST}/api/v1/kline/query?symbol=${symbol}&granularity=${TF_GRANULARITY[interval]}&from=${from}&to=${endTimeMs}`,
        )
        return res.data
          .map((k) => ({
            t: normTs(Number(k[0])),
            o: parseFloat(k[1] as string),
            h: parseFloat(k[2] as string),
            l: parseFloat(k[3] as string),
            c: parseFloat(k[4] as string),
            v: parseFloat(k[5] as string),
            closed: true,
          }))
          .reverse()
      }

      const startAt = Math.floor(endTimeMs / 1000) - limit * (interval === '1m' ? 60 : 300)
      const endAt = Math.floor(endTimeMs / 1000)
      const res = await fetchJson<{ data: string[][] }>(
        `${REST}/api/v1/market/candles?type=${TF_MAP[interval]}&symbol=${symbol}&startAt=${startAt}&endAt=${endAt}`,
      )
      return res.data
        .map((k) => ({
          t: parseInt(k[0], 10) * 1000,
          o: parseFloat(k[1]),
          h: parseFloat(k[3]),
          l: parseFloat(k[4]),
          c: parseFloat(k[2]),
          v: parseFloat(k[5]),
          closed: true,
        }))
        .reverse()
    },

    ...(isF
      ? {
          fetchFuturesMetrics: async (symbols: string[]): Promise<Map<string, FuturesMetrics>> => {
            const want = new Set(symbols)
            const out = new Map<string, FuturesMetrics>()
            const contracts = await fetchContracts()
            for (const c of contracts) {
              if (!want.has(c.symbol)) continue
              out.set(c.symbol, {
                fundingRate: c.fundingFeeRate !== undefined ? c.fundingFeeRate * 100 : null,
                openInterest: c.openInterest !== undefined ? parseFloat(String(c.openInterest)) : null,
              })
            }
            return out
          },
        }
      : {}),

    subscribe(symbols, intervals, onKline, onStatus) {
      // KuCoin futures has no public kline WebSocket topic — poll REST instead
      if (isF) {
        let stopped = false
        onStatus?.('open')
        const poll = async () => {
          if (stopped) return
          await mapPool(symbols, 5, async (sym) => {
            for (const interval of intervals) {
              try {
                const candles = await self.fetchKlines(sym, interval, 3)
                candles.forEach((c, idx) => {
                  onKline({ symbol: sym, interval, candle: { ...c, closed: idx < candles.length - 1 } })
                })
              } catch {
                /* skip */
              }
            }
          })
        }
        void poll()
        const timer = setInterval(() => void poll(), 8000)
        return () => {
          stopped = true
          clearInterval(timer)
        }
      }

      let stopped = false
      let pingTimer: ReturnType<typeof setInterval> | null = null

      const stop = withReconnect(
        async () => {
          const bullet = await fetchJson<BulletResponse>(`${REST}/api/v1/bullet-public`, { method: 'POST' })
          const server = bullet.data.instanceServers[0]
          const connectId = Math.random().toString(36).slice(2)
          const ws = new WebSocket(`${server.endpoint}?token=${bullet.data.token}&connectId=${connectId}`)

          ws.addEventListener('open', () => {
            let n = 0
            for (const s of symbols) {
              const list = intervals.map((i) => `${s}_${TF_MAP[i]}`).join(',')
              ws.send(
                JSON.stringify({
                  id: String(++n),
                  type: 'subscribe',
                  topic: `/market/candles:${list}`,
                  privateChannel: false,
                  response: true,
                }),
              )
            }
            if (pingTimer) clearInterval(pingTimer)
            pingTimer = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ id: String(++n), type: 'ping' }))
              }
            }, Math.max(5000, (server.pingInterval ?? 20000) / 2))
          })

          ws.addEventListener('message', (msg) => {
            try {
              const parsed = JSON.parse(msg.data as string) as KucoinKlineMsg
              if (parsed.type !== 'message' || !parsed.topic?.startsWith('/market/candles:') || !parsed.data) return
              const [symbol, tf] = parsed.topic.split(':')[1].split('_')
              const k = parsed.data.candles
              onKline({
                symbol,
                interval: tf === '1min' ? '1m' : '5m',
                candle: {
                  t: parseInt(k[0], 10) * 1000,
                  o: parseFloat(k[1]),
                  h: parseFloat(k[3]),
                  l: parseFloat(k[4]),
                  c: parseFloat(k[2]),
                  v: parseFloat(k[5]),
                  closed: false, // KuCoin streams forming candles; close inferred by time advance
                },
              })
            } catch {
              /* ignore malformed frames */
            }
          })

          ws.addEventListener('close', () => {
            if (pingTimer) clearInterval(pingTimer)
          })

          return ws
        },
        onStatus,
        () => stopped,
      )

      return () => {
        stopped = true
        if (pingTimer) clearInterval(pingTimer)
        stop()
      }
    },
  }

  return self
}

export const kucoin = makeKucoin('spot')
export const kucoinFutures = makeKucoin('futures')
