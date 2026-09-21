import type { ExchangeId, MarketType } from '@/types'

/**
 * Builds a TradingView chart URL with accurate symbols and exchange prefixes.
 * Handles perpetual contracts (.P suffix) e.g. BINANCE:1000PEPEUSDT.P or BYBIT:BTCUSDT.P
 */
export function getTradingViewUrl(
  exchange: ExchangeId | undefined,
  symbol: string,
  base: string,
  market: MarketType = 'futures'
): string {
  const exch = (exchange || 'binance').toUpperCase()
  let tvExchange = exch

  // TradingView exchange mapping
  if (tvExchange === 'HYPERLIQUID') {
    tvExchange = 'BINANCE'
  }

  // Normalize symbol: remove dashes, swap suffixes
  let clean = symbol.replace(/-SWAP$/i, '').replace(/-/g, '').toUpperCase()

  // Ensure quote currency is present
  if (!clean.endsWith('USDT') && !clean.endsWith('USD') && !clean.endsWith('USDC')) {
    clean = `${base.toUpperCase()}USDT`
  }

  // Append .P for perpetual futures on TradingView
  if (market === 'futures') {
    if (!clean.endsWith('.P')) {
      clean = `${clean}.P`
    }
  } else {
    clean = clean.replace(/\.P$/i, '')
  }

  return `https://www.tradingview.com/chart/?symbol=${tvExchange}:${clean}`
}
