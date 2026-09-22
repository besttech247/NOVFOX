import type { Candle, MarketType, SymbolMeta, Timeframe } from '@/types'
import { EXCLUDED_BASES, fetchJson, mapPool, withReconnect, type ExchangeAdapter, type FuturesMetrics } from './types'

function makeOkx(market: MarketType): ExchangeAdapter {
  const isF = market === 'futures'
  const REST = 'https://www.okx.com'
  const instType = isF ? 'SWAP' : 'SPOT'

  const mapInterval = (i: Timeframe) => (i === '1m' ? '1m' : i === '3m' ? '3m' : '5m')

  const parseKlines = (raw: string[][]): Candle[] =>
    raw.map((k) => ({
      t: parseInt(k[0]),
      o: parseFloat(k[1]),
      h: parseFloat(k[2]),
      l: parseFloat(k[3]),
      c: parseFloat(k[4]),
      v: parseFloat(k[5]), // vol in base ccy
      closed: k[8] === '1',
    })).sort((a, b) => a.t - b.t) // OKX returns newest first

  return {
    id: 'okx',
    name: 'OKX',
    market,

    async fetchTopSymbols(limit: number): Promise<SymbolMeta[]> {
      const res = await fetchJson<{ data: any[] }>(`${REST}/api/v5/market/tickers?instType=${instType}`)
      return res.data
        .filter((t) => t.instId.endsWith(isF ? '-USDT-SWAP' : '-USDT'))
        .map((t) => {
          const base = t.instId.split('-')[0]
          const sod = parseFloat(t.sodUtc0)
          const open24h = parseFloat(t.open24h)
          const last = parseFloat(t.last)
          const hasSod = isFinite(sod) && sod > 0
          const has24 = isFinite(open24h) && open24h > 0
          return {
            symbol: t.instId,
            base,
            quoteVol24h: parseFloat(t.volCcy24h),
            price: last,
            change24h: has24 ? ((last - open24h) / open24h) * 100 : (hasSod ? ((last - sod) / sod) * 100 : 0),
            openDaily: hasSod ? sod : null,
            changeDaily: hasSod ? ((last - sod) / sod) * 100 : null,
          }
        })
        .filter((m) => !EXCLUDED_BASES.has(m.base) && isFinite(m.price) && m.price > 0)
        .sort((a, b) => b.quoteVol24h - a.quoteVol24h)
        .slice(0, limit)
    },

    async fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]> {
      const res = await fetchJson<{ data: string[][] }>(
        `${REST}/api/v5/market/candles?instId=${symbol}&bar=${mapInterval(interval)}&limit=${limit}`
      )
      return parseKlines(res.data)
    },

    async fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]> {
      const res = await fetchJson<{ data: string[][] }>(
        `${REST}/api/v5/market/history-candles?instId=${symbol}&bar=${mapInterval(interval)}&limit=${limit}&after=${endTimeMs}`
      )
      return parseKlines(res.data)
    },

    ...(isF
      ? {
          fetchFuturesMetrics: async (): Promise<Map<string, FuturesMetrics>> => {
            const out = new Map<string, FuturesMetrics>()
            // OKX requires fetching funding rates per symbol or we can just fetch open interest which is bulk
            const oiRes = await fetchJson<{ data: any[] }>(`${REST}/api/v5/public/open-interest?instType=SWAP`)
            for (const item of oiRes.data) {
              if (item.instId.endsWith('-USDT-SWAP')) {
                out.set(item.instId, { openInterest: parseFloat(item.oiCcy) })
              }
            }
            return out
          },
        }
      : {}),

    subscribe(symbols, intervals, onKline, onStatus) {
      let stopped = false
      const stop = withReconnect(
        () => {
          const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/business')
          ws.addEventListener('open', () => {
            const args = symbols.flatMap((s) =>
              intervals.map((i) => ({
                channel: `candle${mapInterval(i)}`,
                instId: s,
              }))
            )
            ws.send(JSON.stringify({ op: 'subscribe', args }))
          })
          ws.addEventListener('message', (msg) => {
            try {
              const parsed = JSON.parse(msg.data as string)
              if (!parsed.data || !parsed.arg) return
              const { arg, data } = parsed
              const k = data[0]
              onKline({
                symbol: arg.instId,
                interval: arg.channel === 'candle1m' ? '1m' : arg.channel === 'candle3m' ? '3m' : '5m',
                candle: {
                  t: parseInt(k[0]),
                  o: parseFloat(k[1]),
                  h: parseFloat(k[2]),
                  l: parseFloat(k[3]),
                  c: parseFloat(k[4]),
                  v: parseFloat(k[5]),
                  closed: k[8] === '1',
                },
              })
            } catch {
              // ignore
            }
          })
          return ws
        },
        onStatus,
        () => stopped
      )
      return () => {
        stopped = true
        stop()
      }
    },
  }
}

export const okx = makeOkx('spot')
export const okxFutures = makeOkx('futures')
