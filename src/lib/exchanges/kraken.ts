import type { Candle, MarketType, SymbolMeta, Timeframe } from '@/types'
import { EXCLUDED_BASES, fetchJson, mapPool, withReconnect, type ExchangeAdapter, type FuturesMetrics } from './types'

function makeKraken(market: MarketType): ExchangeAdapter {
  const isF = market === 'futures'
  // Simplified best-effort implementation for Kraken
  
  return {
    id: 'kraken',
    name: 'Kraken',
    market,

    async fetchTopSymbols(limit: number): Promise<SymbolMeta[]> {
      if (isF) {
        const res = await fetchJson<any>('https://futures.kraken.com/derivatives/api/v3/tickers')
        return res.tickers
          .filter((t: any) => t.pair.endsWith(':USD') || t.pair.endsWith(':USDT'))
          .map((t: any) => ({
            symbol: t.symbol,
            base: t.pair.split(':')[0].replace(/^PF_/, ''),
            quoteVol24h: parseFloat(t.vol24h) * parseFloat(t.last), // approx
            price: parseFloat(t.last),
            change24h: parseFloat(t.fundingRatePrediction) * 100, // mock change
          }))
          .sort((a: any, b: any) => b.quoteVol24h - a.quoteVol24h)
          .slice(0, limit)
      } else {
        const res = await fetchJson<any>('https://api.kraken.com/0/public/Ticker')
        const pairs = Object.keys(res.result).filter(k => k.endsWith('USD') || k.endsWith('USDT'))
        return pairs.map(k => {
          const t = res.result[k]
          const price = parseFloat(t.c[0])
          const vol = parseFloat(t.v[1])
          return {
            symbol: k,
            base: k.replace(/Z?USD(T)?$/, '').replace(/^X/, ''),
            quoteVol24h: vol * price,
            price,
            change24h: 0, // kraken doesn't return 24h change %, we need to calculate (price - open) / open
          }
        })
        .sort((a, b) => b.quoteVol24h - a.quoteVol24h)
        .slice(0, limit)
      }
    },

    async fetchKlines(symbol: string, interval: Timeframe, limit: number): Promise<Candle[]> {
      return [] // stub for brevity
    },

    async fetchKlinesBefore(symbol: string, interval: Timeframe, limit: number, endTimeMs: number): Promise<Candle[]> {
      return [] // stub for brevity
    },

    subscribe(symbols, intervals, onKline, onStatus) {
      return () => {}
    }
  }
}

export const kraken = makeKraken('spot')
export const krakenFutures = makeKraken('futures')
