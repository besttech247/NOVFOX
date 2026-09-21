import { useState } from 'react'

/**
 * Coin logo. Resolution order:
 *  1. server-cached CoinGecko map (covers new/memecoin listings)
 *  2. spothq/cryptocurrency-icons CDN by symbol (always works for majors)
 *  3. deterministic colored letter circle as the final fallback
 * "1000X"-style perp symbols also try the plain "X" variant.
 */

const SPOTHQ = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color'

function namesFor(base: string): string[] {
  const b = base.toLowerCase()
  return b.startsWith('1000') && b.length > 4 ? [b, b.slice(4)] : [b]
}

function candidateUrls(base: string, icons: Record<string, string>): string[] {
  const names = namesFor(base)
  const urls: string[] = []
  for (const n of names) {
    const u = icons[n]
    if (u) urls.push(u)
  }
  for (const n of names) urls.push(`${SPOTHQ}/${n}.png`)
  return urls
}

function hueFor(base: string): number {
  let h = 0
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0
  return h % 360
}

export function CoinIcon({
  base,
  icons = {},
  size = 18,
  className = '',
}: {
  base: string
  icons?: Record<string, string>
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState<Record<string, true>>({})
  const url = candidateUrls(base, icons).find((u) => !failed[u])
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFailed((m) => (m[url] ? m : { ...m, [url]: true }))}
        className={`shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  const hue = hueFor(base)
  return (
    <span
      aria-hidden
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-bold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.52),
        background: `hsl(${hue} 45% 40% / 0.28)`,
        color: `hsl(${hue} 85% 68%)`,
      }}
    >
      {base[0] ?? '?'}
    </span>
  )
}
