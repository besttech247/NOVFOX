/**
 * TradFi (Traditional Finance) detector:
 * Identifies Commodities (Metals: Gold, Silver), Energy (Oil, Brent, Gas),
 * Equities / Stocks (NVDA, TSLA, AAPL...), and Market Indices.
 */

export const METALS_BASES = new Set([
  'XAU',
  'XAG',
  'GOLD',
  'SILVER',
  'PAXG',
  'COPPER',
  'PLATINUM',
  'PALLADIUM',
  'XPT',
  'XPD',
])

export const OIL_BASES = new Set([
  'USOIL',
  'UKOIL',
  'BRENT',
  'WTI',
  'OIL',
  'GAS',
  'NATGAS',
  'CRUDE',
])

export const STOCKS_INDICES_BASES = new Set([
  'SPX',
  'SP500',
  'US500',
  'NDX',
  'NAS100',
  'DJI',
  'US30',
  'DOW',
  'VIX',
  'DAX',
  'FTSE',
  'NIKKEI',
  'HSI',
  'NVDA',
  'TSLA',
  'AAPL',
  'MSFT',
  'AMZN',
  'GOOG',
  'GOOGL',
  'META',
  'COIN',
  'PLTR',
  'AMD',
  'BABA',
  'MSTR',
  'NFLX',
  'ARM',
  'SMCI',
  'DIS',
  'INTC',
  'PYPL',
  'UBER',
  'GME',
  'AMC',
  'CRCL',
  'HOOD',
  'RDDT',
  'OPEN',
  'RBLX',
  'SNOW',
  'SQ',
  'NIO',
  'BIDU',
  'JD',
  'PDD',
  'BILI',
  'LI',
  'XPEV',
  'RIVN',
  'LCID',
])

export const TRADFI_BASES = new Set([...METALS_BASES, ...OIL_BASES, ...STOCKS_INDICES_BASES])

export function isMetal(base: string, symbol: string = ''): boolean {
  const b = base.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (METALS_BASES.has(b)) return true
  if (b.startsWith('XAU') || b.startsWith('XAG') || b === 'GOLD' || b === 'SILVER' || b === 'PAXG') return true
  if (s.startsWith('XAU') || s.startsWith('XAG') || s.startsWith('GOLD') || s.startsWith('SILVER')) return true
  return false
}

export function isOil(base: string, symbol: string = ''): boolean {
  const b = base.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (OIL_BASES.has(b)) return true
  if (b === 'USOIL' || b === 'UKOIL' || b === 'BRENT' || b === 'WTI' || b === 'NATGAS') return true
  if (s.includes('USOIL') || s.includes('UKOIL') || s.includes('BRENT') || s.includes('WTI')) return true
  return false
}

export function isStockOrIndex(base: string, symbol: string = ''): boolean {
  const b = base.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (STOCKS_INDICES_BASES.has(b)) return true
  if (b === 'SP500' || b === 'NAS100' || b === 'US500' || b === 'US30' || b === 'SPX') return true
  if (s.includes('SP500') || s.includes('NAS100') || s.includes('US500') || s.includes('US30')) return true
  return false
}

export function isCommodityOrStock(base: string, symbol: string = ''): boolean {
  return isMetal(base, symbol) || isOil(base, symbol) || isStockOrIndex(base, symbol)
}

// ==========================================
// 5. عملات الإقراض اللامركزي (DeFi Lending Tokens)
// ==========================================
export const LENDING_BASES = new Set([
  'AAVE',
  'COMP',
  'MKR',
  'SKY',
  'XVS',
  'RDNT',
  'BENQI',
  'QI',
  'KAVA',
  'HARD',
  'CREAM',
  'MORPHO',
  'EUL',
  'INV',
  'JST',
  'TAROT',
  'SILO',
  'GEAR',
  'OOKI',
  'WING',
  'FOR',
  'KMNO',
  'SLND',
  'SAVE',
  'NAVX',
  'SCA',
  'ZERO',
  'INIT',
  'LQTY',
  'SPELL',
  'ALCX',
  'TRU',
  'TRUE',
  'MPL',
  'MAPLE',
  'SYRUP',
  'CPOOL',
  'FLX',
  'GHO',
])

export function isLendingToken(base: string, symbol: string = ''): boolean {
  const b = base.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (LENDING_BASES.has(b)) return true
  if (s.startsWith('AAVE') || s.startsWith('COMP') || s.startsWith('MKR') || s.startsWith('RDNT') || s.startsWith('XVS')) return true
  return false
}

// ==========================================
// 6. عملات القمار والكازينو والمراهنات (Gambling & Casino Tokens)
// ==========================================
export const GAMBLING_BASES = new Set([
  'RLB',
  'ROLLBIT',
  'FUN',
  'WIN',
  'WINK',
  'SHFL',
  'SHUFFLE',
  'TGC',
  'SX',
  'BET',
  'DICE',
  'BC',
  'CASINO',
  'LUCK',
  'LOTTO',
  'BETU',
  'WGR',
  'UBET',
  'ROLL',
  'SPIN',
  'JACKPOT',
  'POKER',
  'HAMS',
  'PUNT',
])

export function isGamblingToken(base: string, symbol: string = ''): boolean {
  const b = base.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (GAMBLING_BASES.has(b)) return true
  if (s.includes('CASINO') || s.includes('ROLLBIT') || s.includes('SHUFFLE') || s.includes('BETTING')) return true
  return false
}


