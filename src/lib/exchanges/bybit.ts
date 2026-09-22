import type { Candle, MarketType, SymbolMeta, Timeframe } from '@/types'
import { EXCLUDED_BASES, fetchJson, withReconnect, type ExchangeAdapter, type FuturesMetrics } from './types'

const REST = 'https://api.bybit.com'

const TF_MAP: Record<Timeframe, string> = { '1m': '1', '5m': '5' }

interface BybitTicker {
  symbol: string
  lastPrice: string
  turnover24h: string
  price24hPcnt: string
  fundingRate?: string
  openInterest?: string
}

interface BybitKlineMsg {
  topic?: string
  data?: Array<{
    start: string
    open: string
    high: string
    low: string
    close: string
    volume: string
    confirm: boolean
  }>
}

function makeBybit(market: MarketType): ExchangeAdapter {
  const isF = market === 'futures'
  const category = isF ? 'linear' : 'spot'
  const wsUrl = isF ? 'wss://stream.bybit.com/v5/public/linear' : 'wss://stream.bybit.com/v5/public/spot'

  const parseKlines = (list: string[][]): Candle[] =>
    list
      .map((k) => ({
        t: parseInt(k[0], 10),
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4]),
        v: parseFloat(k[5]),
        closed: true,
      }))
      .reverse()

  const fetchTickers = async () =>
    (await fetchJson<{ result: { list: BybitTicker[] } }>(`${REST}/v5/market/tickers?category=${category}`)).result
      .list

  return {
    id: 'bybit',
    name: 'Bybit',
    market,

    async fetchTopSymbols(limit: number): Promise<SymbolMeta[]> {
      const list = await fetchTickers()
      return list
        .filter((t) => t.symbol.endsWith('USDT'))
        .map((t) => ({
          symbol: t.symbol,
          base: t.symbol.slice(0, -4),
          quoteVol24h: parseFloat(t.turnover24h),
          price: parseFloat(t.lastPrice),
          change24h: parseFloat(t.price24hPcnt) * 100,
        }))
        .filter((m) => !EXCLUDED_BASES.has(m.base) && isFinite(m.price) && m.price > 0)
        .sort((a, b) => b.quoteVol24h - a.quoteVol24h)
        .slice(0, limit)
    },

    async fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]> {
      const res = await fetchJson<{ result: { list: string[][] } }>(
        `${REST}/v5/market/kline?category=${category}&symbol=${symbol}&interval=${TF_MAP[interval]}&limit=${limit}`,
      )
      return parseKlines(res.result.list)
    },

    async fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]> {
      const res = await fetchJson<{ result: { list: string[][] } }>(
        `${REST}/v5/market/kline?category=${category}&symbol=${symbol}&interval=${TF_MAP[interval]}&limit=${limit}&end=${endTimeMs}`,
      )
      return parseKlines(res.result.list)
    },

    ...(isF
      ? {
          // linear tickers already carry fundingRate + openInterest — one call for everything
          fetchFuturesMetrics: async (symbols: string[]): Promise<Map<string, FuturesMetrics>> => {
            const want = new Set(symbols)
            const out = new Map<string, FuturesMetrics>()
            const list = await fetchTickers()
            for (const t of list) {
              if (!want.has(t.symbol)) continue
              out.set(t.symbol, {
                fundingRate: t.fundingRate !== undefined ? parseFloat(t.fundingRate) * 100 : null,
                openInterest: t.openInterest !== undefined ? parseFloat(t.openInterest) : null,
              })
            }
            return out
          },
        }
      : {}),

    fetchDailyOpen: async (symbols: string[]): Promise<Map<string, number>> => {
      const out = new Map<string, number>()
      await mapPool(symbols, 3, async (sym) => {
        try {
          const res = await fetchJson<{ result: { list: string[][] } }>(
            `${REST}/v5/market/kline?category=${category}&symbol=${sym}&interval=D&limit=1`,
          )
          const k = res.result?.list?.[0]
          if (k && k[1]) {
            const o = parseFloat(k[1])
            if (isFinite(o) && o > 0) out.set(sym, o)
          }
          await new Promise((r) => setTimeout(r, 50))
        } catch {
          /* ignore */
        }
      })
      return out
    },

    subscribe(symbols, intervals, onKline, onStatus) {
      let stopped = false
      let pingTimer: ReturnType<typeof setInterval> | null = null

      const stop = withReconnect(
        () => {
          const ws = new WebSocket(wsUrl)
          ws.addEventListener('open', () => {
            const args = symbols.flatMap((s) => intervals.map((i) => `kline.${TF_MAP[i]}.${s}`))
            for (let i = 0; i < args.length; i += 10) {
              ws.send(JSON.stringify({ op: 'subscribe', args: args.slice(i, i + 10) }))
            }
            pingTimer = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }))
            }, 15000)
          })
          ws.addEventListener('message', (msg) => {
            try {
              const parsed = JSON.parse(msg.data as string) as BybitKlineMsg
              if (!parsed.topic || !parsed.data) return
              const parts = parsed.topic.split('.')
              if (parts[0] !== 'kline') return
              const interval = (parts[1] === '1' ? '1m' : '5m') as Timeframe
              const symbol = parts[2]
              for (const k of parsed.data) {
                onKline({
                  symbol,
                  interval,
                  candle: {
                    t: parseInt(k.start, 10),
                    o: parseFloat(k.open),
                    h: parseFloat(k.high),
                    l: parseFloat(k.low),
                    c: parseFloat(k.close),
                    v: parseFloat(k.volume),
                    closed: Boolean(k.confirm),
                  },
                })
              }
            } catch {
              /* ignore */
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
}

export const bybit = makeBybit('spot')
export const bybitFutures = makeBybit('futures')
