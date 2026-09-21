import type { Candle, MarketType, SymbolMeta, Timeframe } from '@/types'
import { EXCLUDED_BASES, fetchJson, mapPool, withReconnect, type ExchangeAdapter, type FuturesMetrics } from './types'

const API_URL = 'https://api.hyperliquid.xyz/info'
const WS_URL = 'wss://api.hyperliquid.xyz/ws'

async function hlPost<T>(body: any): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('HL API Error')
  return res.json() as T
}

function makeHyperliquid(market: MarketType): ExchangeAdapter {
  return {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    market, // strictly perps for now, spot requires different parsing, but let's assume perps

    async fetchTopSymbols(limit: number): Promise<SymbolMeta[]> {
      const data = await hlPost<any[]>({ type: 'metaAndAssetCtxs' })
      const universe = data[0].universe
      const ctxs = data[1]
      
      const out: SymbolMeta[] = []
      for (let i = 0; i < universe.length; i++) {
        const u = universe[i]
        const c = ctxs[i]
        if (EXCLUDED_BASES.has(u.name)) continue
        
        const price = parseFloat(c.markPx)
        const prev = parseFloat(c.prevDayPx)
        const change24h = ((price - prev) / prev) * 100
        
        out.push({
          symbol: u.name,
          base: u.name,
          quoteVol24h: parseFloat(c.dayNtlVlm),
          price,
          change24h,
        })
      }
      
      return out.sort((a, b) => b.quoteVol24h - a.quoteVol24h).slice(0, limit)
    },

    async fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]> {
      const endTime = Date.now()
      const data = await hlPost<any[]>({
        type: 'candleSnapshot',
        req: { coin: symbol, interval, endTime }
      })
      // HL returns [{t, o, h, l, c, v, T, n}, ...]
      return data.slice(-limit).map(k => ({
        t: k.t,
        o: parseFloat(k.o),
        h: parseFloat(k.h),
        l: parseFloat(k.l),
        c: parseFloat(k.c),
        v: parseFloat(k.v),
        closed: Date.now() > k.T,
      }))
    },

    async fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]> {
      const data = await hlPost<any[]>({
        type: 'candleSnapshot',
        req: { coin: symbol, interval, endTime: endTimeMs }
      })
      return data.slice(-limit).map(k => ({
        t: k.t,
        o: parseFloat(k.o),
        h: parseFloat(k.h),
        l: parseFloat(k.l),
        c: parseFloat(k.c),
        v: parseFloat(k.v),
        closed: true,
      }))
    },

    ...(market === 'futures' ? {
      fetchFuturesMetrics: async (): Promise<Map<string, FuturesMetrics>> => {
        const out = new Map<string, FuturesMetrics>()
        const data = await hlPost<any[]>({ type: 'metaAndAssetCtxs' })
        const universe = data[0].universe
        const ctxs = data[1]
        for (let i = 0; i < universe.length; i++) {
          const u = universe[i]
          const c = ctxs[i]
          out.set(u.name, {
            fundingRate: parseFloat(c.funding) * 100, // HL funding is raw e.g. 0.0001
            openInterest: parseFloat(c.openInterest)
          })
        }
        return out
      }
    } : {}),

    subscribe(symbols, intervals, onKline, onStatus) {
      let stopped = false
      const stop = withReconnect(
        () => {
          const ws = new WebSocket(WS_URL)
          ws.addEventListener('open', () => {
            for (const coin of symbols) {
              for (const interval of intervals) {
                ws.send(JSON.stringify({
                  method: 'subscribe',
                  subscription: { type: 'candle', coin, interval }
                }))
              }
            }
          })
          ws.addEventListener('message', (msg) => {
            try {
              const parsed = JSON.parse(msg.data as string)
              if (parsed.channel === 'candle') {
                const k = parsed.data
                onKline({
                  symbol: k.s, // coin name
                  interval: k.i as Timeframe,
                  candle: {
                    t: k.t,
                    o: parseFloat(k.o),
                    h: parseFloat(k.h),
                    l: parseFloat(k.l),
                    c: parseFloat(k.c),
                    v: parseFloat(k.v),
                    closed: Date.now() > k.T,
                  }
                })
              }
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
    }
  }
}

export const hyperliquid = makeHyperliquid('spot')
export const hyperliquidFutures = makeHyperliquid('futures')
