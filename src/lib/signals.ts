import type { Candle, ScannerSettings, SignalPart, SignalStrength, SymbolMeta, SymbolScan } from '@/types'
import { atr, ema, priorHigh, relativeVolume, rollingVwap, rsi } from './indicators'

const MIN_CANDLES = 60

/** futures-only extras: funding in percent (0.01 = 0.01%), OI change in percent */
export interface SignalExtras {
  fundingRate?: number | null
  oiChangePct?: number | null
}

function lastClosed(candles: Candle[]): Candle[] {
  // drop forming candle from calculations
  if (candles.length > 0 && !candles[candles.length - 1].closed) return candles.slice(0, -1)
  return candles
}

/**
 * Long-only scalping signal engine.
 * Evaluates the primary timeframe candles, with a trend filter from the higher timeframe.
 */
export function evaluateSymbol(
  meta: SymbolMeta,
  primaryRaw: Candle[],
  trendRaw: Candle[],
  settings: ScannerSettings,
  extras?: SignalExtras,
): SymbolScan {
  const base: SymbolScan = {
    meta,
    score: 0,
    strength: 'none',
    parts: [],
    rsi: null,
    relVol: null,
    atrPct: null,
    vwapDistPct: null,
    trendUp: false,
    passesFilters: true,
    filterReasons: [],
    spark: [],
    vwapSpark: [],
    updatedAt: Date.now(),
  }

  const primary = lastClosed(primaryRaw)
  if (primary.length < MIN_CANDLES) {
    base.passesFilters = false
    base.filterReasons.push('بيانات غير كافية')
    base.spark = primaryRaw.slice(-60).map((c) => c.c)
    return base
  }

  const closes = primary.map((c) => c.c)
  const vols = primary.map((c) => c.v)
  const i = primary.length - 1

  const ema9 = ema(closes, 9)
  const ema21 = ema(closes, 21)
  const ema50p = ema(closes, 50)
  const rsiArr = rsi(closes, 14)
  const atrArr = atr(primary, 14)
  const vwapArr = rollingVwap(primary, 100)
  const relVol = relativeVolume(vols, 20)

  const price = closes[i]
  base.rsi = isFinite(rsiArr[i]) ? rsiArr[i] : null
  base.relVol = relVol
  base.atrPct = isFinite(atrArr[i]) ? (atrArr[i] / price) * 100 : null
  base.vwapDistPct = isFinite(vwapArr[i]) ? ((price - vwapArr[i]) / vwapArr[i]) * 100 : null
  base.spark = closes.slice(-60)
  base.vwapSpark = vwapArr.slice(-60).map((v) => (isFinite(v) ? v : price))

  // ---------- Quality filters ----------
  if (meta.quoteVol24h < settings.minQuoteVolM * 1_000_000) {
    base.passesFilters = false
    base.filterReasons.push('سيولة منخفضة')
  }
  if (base.atrPct !== null && (base.atrPct < 0.03 || base.atrPct > 3)) {
    base.passesFilters = false
    base.filterReasons.push('تذبذب غير مناسب')
  }

  // ---------- Long-only scoring ----------
  // per-indicator kill-switches from settings (missing key = enabled, for old persisted settings)
  const on = (k: keyof ScannerSettings['indicators']) => settings.indicators?.[k] !== false
  const parts: SignalPart[] = []

  // S1 · EMA momentum (max 30) — a cross within the last 3 closed candles still counts as fresh
  let crossUp = false
  for (let j = Math.max(1, i - 2); j <= i; j++) {
    if (ema9[j - 1] <= ema21[j - 1] && ema9[j] > ema21[j]) {
      crossUp = true
      break
    }
  }
  const emaAligned = ema9[i] > ema21[i] && ema21[i] > ema21[i - 1]
  if (on('ema')) {
    if (crossUp) {
      parts.push({ key: 'ema-cross', label: 'تقاطع EMA صاعد', points: 30 })
    } else if (emaAligned) {
      parts.push({ key: 'ema-align', label: 'زخم EMA إيجابي', points: 15 })
    }
  }

  // S2 · VWAP (max 25)
  const vwapNow = vwapArr[i]
  const vwapPrev = vwapArr[i - 1]
  if (on('vwap') && isFinite(vwapNow) && isFinite(vwapPrev)) {
    if (closes[i - 1] <= vwapPrev && price > vwapNow) {
      parts.push({ key: 'vwap-reclaim', label: 'استعادة VWAP', points: 25 })
    } else if (price > vwapNow) {
      parts.push({ key: 'vwap-above', label: 'فوق VWAP', points: 10 })
    }
  }

  // S3 · RSI (max 20, with overbought penalty)
  const rNow = rsiArr[i]
  const rPrev = rsiArr[i - 1]
  if (on('rsi') && isFinite(rNow) && isFinite(rPrev)) {
    if (rPrev < 30 && rNow >= 30) {
      parts.push({ key: 'rsi-bounce', label: 'ارتداد RSI من تشبع بيعي', points: 20 })
    } else if (rNow >= 40 && rNow <= 60 && rNow > rPrev) {
      parts.push({ key: 'rsi-rising', label: 'RSI صاعد بمنطقة صحية', points: 10 })
    }
    if (rNow > 85) {
      parts.push({ key: 'rsi-hot', label: 'RSI متشبع شرائياً', points: -5 })
    }
  }

  // S4 · Volume spike (max 20, with dry-volume penalty)
  if (on('volume') && relVol !== null) {
    const x = settings.volSpikeX
    if (relVol >= x) {
      parts.push({ key: 'vol-spike', label: `انفجار حجم ×${relVol.toFixed(1)}`, points: 20 })
    } else if (relVol >= x * 0.66) {
      parts.push({ key: 'vol-high', label: `حجم مرتفع ×${relVol.toFixed(1)}`, points: 12 })
    } else if (relVol >= 1.3) {
      parts.push({ key: 'vol-ok', label: `حجم فوق المتوسط ×${relVol.toFixed(1)}`, points: 6 })
    }
    if (relVol < 0.7) {
      parts.push({ key: 'vol-dry', label: 'حجم ضعيف', points: -10 })
    }
  }

  // S5 · Higher-timeframe trend alignment (max 10)
  const trend = lastClosed(trendRaw)
  if (on('trend') && trend.length >= 55) {
    const tCloses = trend.map((c) => c.c)
    const ema50t = ema(tCloses, 50)
    const ti = tCloses.length - 1
    if (isFinite(ema50t[ti])) {
      base.trendUp = tCloses[ti] > ema50t[ti]
      if (base.trendUp) {
        parts.push({ key: 'trend-up', label: 'الاتجاه العام صاعد', points: 10 })
      } else {
        parts.push({ key: 'trend-down', label: 'عكس الاتجاه العام', points: -10 })
      }
    }
  } else if (on('trend') && isFinite(ema50p[i])) {
    base.trendUp = price > ema50p[i]
    if (base.trendUp) parts.push({ key: 'trend-up', label: 'فوق EMA50', points: 10 })
  }

  // S6 · Local breakout (max 10)
  const ph = priorHigh(primary, i, 20)
  if (on('breakout') && price > ph && ph > 0) {
    parts.push({ key: 'breakout', label: 'كسر قمة 20 شمعة', points: 10 })
  }

  // S7 · Futures: open-interest momentum (max 15)
  // OI rising while price is above EMA9 = new money flowing into longs
  if (on('oi') && extras?.oiChangePct != null && isFinite(ema9[i])) {
    if (extras.oiChangePct >= 1 && price > ema9[i]) {
      parts.push({ key: 'oi-up', label: `زخم OI داعم +${extras.oiChangePct.toFixed(1)}%`, points: 15 })
    } else if (extras.oiChangePct <= -2) {
      parts.push({ key: 'oi-down', label: 'تسرب من المراكز (OI)', points: -5 })
    }
  }

  // S8 · Futures: funding rate extremes (crowding gauge)
  if (on('funding') && extras?.fundingRate != null) {
    if (extras.fundingRate >= 0.05) {
      parts.push({ key: 'funding-hot', label: 'Funding مرتفع — حذر من تصفيات', points: -10 })
    } else if (extras.fundingRate <= -0.05) {
      parts.push({ key: 'funding-neg', label: 'Funding سلبي — وقود للصعود', points: 5 })
    }
  }

  let score = parts.reduce((s, p) => s + p.points, 0)
  score = Math.max(0, Math.min(100, Math.round(score)))

  base.parts = parts.sort((a, b) => b.points - a.points)
  base.score = score

  let strength: SignalStrength = 'none'
  if (base.passesFilters) {
    if (score >= settings.strongThreshold) strength = 'strong'
    else if (score >= settings.normalThreshold) strength = 'normal'
  }
  base.strength = strength
  return base
}
