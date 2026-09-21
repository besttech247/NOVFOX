import type { ExchangeId, MarketType } from '@/types'
import { binance, binanceFutures } from './binance'
import { bybit, bybitFutures } from './bybit'
import { kucoin, kucoinFutures } from './kucoin'
import { okx, okxFutures } from './okx'
import { kraken, krakenFutures } from './kraken'
import { hyperliquid, hyperliquidFutures } from './hyperliquid'
import { coinbase, coinbaseFutures } from './coinbase'
import type { ExchangeAdapter } from './types'

export const EXCHANGES: Record<ExchangeId, Record<MarketType, ExchangeAdapter>> = {
  binance: { spot: binance, futures: binanceFutures },
  bybit: { spot: bybit, futures: bybitFutures },
  kucoin: { spot: kucoin, futures: kucoinFutures },
  okx: { spot: okx, futures: okxFutures },
  kraken: { spot: kraken, futures: krakenFutures },
  coinbase: { spot: coinbase, futures: coinbaseFutures },
  hyperliquid: { spot: hyperliquid, futures: hyperliquidFutures },
}

/** for the exchange tab bar (names/ids) */
export const EXCHANGE_LIST = [
  { id: 'binance', name: 'Binance' },
  { id: 'bybit', name: 'Bybit' },
  { id: 'okx', name: 'OKX' },
  { id: 'kucoin', name: 'KuCoin' },
  { id: 'hyperliquid', name: 'Hyperliquid' },
  { id: 'kraken', name: 'Kraken' },
  { id: 'coinbase', name: 'Coinbase' },
] as const

export type { ExchangeAdapter, FuturesMetrics, KlineEvent } from './types'
