export function fmtPrice(p: number): string {
  if (!isFinite(p) || p === 0) return '—'
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 1 })
  if (p >= 10) return p.toFixed(2)
  if (p >= 1) return p.toFixed(3)
  if (p >= 0.01) return p.toFixed(5)
  return p.toFixed(7)
}

export function fmtPct(v: number | null, signed = true): string {
  if (v === null || !isFinite(v)) return '—'
  const sign = signed && v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

export function fmtVol(usd: number): string {
  if (!isFinite(usd)) return '—'
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`
  return `$${usd.toFixed(0)}`
}

export function fmtClock(t: number): string {
  return new Date(t).toLocaleTimeString('en-GB', { hour12: false })
}

export function fmtAgo(t: number, now: number): string {
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 10) return 'الآن'
  if (s < 60) return `منذ ${s} ث`
  const m = Math.floor(s / 60)
  if (m < 60) return `منذ ${m} د`
  return `منذ ${Math.floor(m / 60)} س`
}
