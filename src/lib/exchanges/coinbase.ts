import type { Candle, MarketType, SymbolMeta, Timeframe } from '@/types'
import { EXCLUDED_BASES, fetchJson, type ExchangeAdapter } from './types'

function makeCoinbase(market: MarketType): ExchangeAdapter {
  return {
    id: 'coinbase',
    name: 'Coinbase',
    market,

    async fetchTopSymbols(limit: number): Promise<SymbolMeta[]> {
      const res = await fetchJson<any[]>('https://api.exchange.coinbase.com/products')
      return res
        .filter((t: any) => t.quote_currency === 'USD' || t.quote_currency === 'USDC')
        .map((t: any) => ({
          symbol: t.id,
          base: t.base_currency,
          quoteVol24h: 1000000, // coinbase public api doesn't include volume in /products
          price: 1, // mock, need to fetch /ticker which is 1-by-1
          change24h: 0,
        }))
        .filter((m) => !EXCLUDED_BASES.has(m.base))
        .slice(0, limit)
    },

    async fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]> {
      return []
    },

    async fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]> {
      return []
    },

    subscribe(symbols, intervals, onKline, onStatus) {
      return () => {}
    }
  }
}

export const coinbase = makeCoinbase('spot')
export const coinbaseFutures = makeCoinbase('futures')
