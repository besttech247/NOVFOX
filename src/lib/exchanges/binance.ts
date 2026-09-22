import type { Candle, MarketType, SymbolMeta, Timeframe } from '@/types'
import { EXCLUDED_BASES, fetchJson, mapPool, withReconnect, type ExchangeAdapter, type FuturesMetrics } from './types'

interface BinanceTicker {
  symbol: string
  lastPrice: string
  quoteVolume: string
  priceChangePercent: string
}

interface PremiumIndex {
  symbol: string
  lastFundingRate: string
}

function makeBinance(market: MarketType): ExchangeAdapter {
  const isF = market === 'futures'
  // spot has a public-data fallback domain for geo-blocked regions; futures does not
  const REST_HOSTS = isF
    ? ['https://fapi.binance.com']
    : ['https://api.binance.com', 'https://data-api.binance.vision']
  const WS_HOSTS = isF
    ? ['wss://fstream.binance.com/stream']
    : ['wss://stream.binance.com:9443/stream', 'wss://data-stream.binance.vision/stream']

  let restBase = REST_HOSTS[0]

  async function bfetch<T>(path: string): Promise<T> {
    try {
      return await fetchJson<T>(`${restBase}${path}`)
    } catch (err) {
      const alt = REST_HOSTS.find((h) => h !== restBase)
      if (!alt) throw err
      const data = await fetchJson<T>(`${alt}${path}`)
      restBase = alt
      return data
    }
  }

  const klinePath = (symbol: string, interval: Timeframe, limit: number) =>
    isF
      ? `/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      : `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`

  const parseKlines = (raw: unknown[][]): Candle[] =>
    raw.map((k) => ({
      t: k[0] as number,
      o: parseFloat(k[1] as string),
      h: parseFloat(k[2] as string),
      l: parseFloat(k[3] as string),
      c: parseFloat(k[4] as string),
      v: parseFloat(k[5] as string),
      closed: true,
    }))

  return {
    id: 'binance',
    name: 'Binance',
    market,

    async fetchTopSymbols(limit: number): Promise<SymbolMeta[]> {
      const data = await bfetch<BinanceTicker[]>(isF ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr')
      return data
        .filter(
          (t) =>
            t.symbol.endsWith('USDT') &&
            !t.symbol.includes('_') && // perpetuals only (exclude dated futures)
            !t.symbol.endsWith('DOWNUSDT') &&
            !t.symbol.endsWith('UPUSDT'),
        )
        .map((t) => ({
          symbol: t.symbol,
          base: t.symbol.slice(0, -4),
          quoteVol24h: parseFloat(t.quoteVolume),
          price: parseFloat(t.lastPrice),
          change24h: parseFloat(t.priceChangePercent),
        }))
        .filter((m) => !EXCLUDED_BASES.has(m.base) && isFinite(m.price) && m.price > 0)
        .sort((a, b) => b.quoteVol24h - a.quoteVol24h)
        .slice(0, limit)
    },

    async fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]> {
      return parseKlines(await bfetch<unknown[][]>(klinePath(symbol, interval, limit)))
    },

    async fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]> {
      return parseKlines(
        await bfetch<unknown[][]>(`${klinePath(symbol, interval, limit)}&endTime=${endTimeMs}`),
      )
    },

    ...(isF
      ? {
          fetchFuturesMetrics: async (symbols: string[]): Promise<Map<string, FuturesMetrics>> => {
            const out = new Map<string, FuturesMetrics>()
            const premium = await bfetch<PremiumIndex[]>('/fapi/v1/premiumIndex')
            for (const p of premium) {
              out.set(p.symbol, { fundingRate: parseFloat(p.lastFundingRate) * 100 })
            }
            // open interest per symbol (lightweight endpoint, weight 1)
            await mapPool(symbols, 6, async (sym) => {
              try {
                const oi = await bfetch<{ openInterest: string }>(`/fapi/v1/openInterest?symbol=${sym}`)
                const rec = out.get(sym) ?? {}
                rec.openInterest = parseFloat(oi.openInterest)
                out.set(sym, rec)
              } catch {
                /* skip symbol */
              }
            })
            return out
          },
        }
      : {}),

    fetchDailyOpen: async (symbols: string[]): Promise<Map<string, number>> => {
      const out = new Map<string, number>()
      if (!isF) {
        for (let i = 0; i < symbols.length; i += 50) {
          const chunk = symbols.slice(i, i + 50)
          try {
            const data = await bfetch<Array<{ symbol: string; openPrice: string }>>(
              `/api/v3/ticker/tradingDay?symbols=${encodeURIComponent(JSON.stringify(chunk))}`,
            )
            for (const item of data) {
              const o = parseFloat(item.openPrice)
              if (isFinite(o) && o > 0) out.set(item.symbol, o)
            }
          } catch {
            /* ignore */
          }
        }
      } else {
        await mapPool(symbols, 4, async (sym) => {
          try {
            const data = await bfetch<unknown[][]>(`/fapi/v1/klines?symbol=${sym}&interval=1d&limit=1`)
            if (data && data[0] && data[0][1]) {
              const o = parseFloat(data[0][1] as string)
              if (isFinite(o) && o > 0) out.set(sym, o)
            }
          } catch {
            /* ignore */
          }
        })
      }
      return out
    },

    subscribe(symbols, intervals, onKline, onStatus) {
      let stopped = false
      const streams = symbols
        .flatMap((s) => intervals.map((i) => `${s.toLowerCase()}@kline_${i}`))
        .join('/')

      // alternate between WS hosts on each (re)connect attempt — covers geo-blocked regions
      let hostIdx = 0
      const stop = withReconnect(
        () => {
          const host = WS_HOSTS[hostIdx % WS_HOSTS.length]
          hostIdx++
          const ws = new WebSocket(`${host}?streams=${streams}`)
          ws.addEventListener('message', (msg) => {
            try {
              const parsed = JSON.parse(msg.data as string)
              const k = parsed?.data?.k
              if (!k) return
              onKline({
                symbol: k.s as string,
                interval: k.i as Timeframe,
                candle: {
                  t: k.t as number,
                  o: parseFloat(k.o),
                  h: parseFloat(k.h),
                  l: parseFloat(k.l),
                  c: parseFloat(k.c),
                  v: parseFloat(k.v),
                  closed: Boolean(k.x),
                },
              })
            } catch {
              /* ignore malformed frames */
            }
          })
          return ws
        },
        onStatus,
        () => stopped,
      )

      return () => {
        stopped = true
        stop()
      }
    },
  }
}

export const binance = makeBinance('spot')
export const binanceFutures = makeBinance('futures')
