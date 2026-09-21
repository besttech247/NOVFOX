/**
 * Coin logo map (symbol → image URL) built from CoinGecko's public markets
 * endpoint and cached in memory for 6h. The client hot-links the returned
 * coin-images.coingecko.com URLs directly, so the server only pays 2 requests
 * per refresh window. On failure the stale map keeps being served.
 */

const TTL = 6 * 60 * 60_000
const FETCH_HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; scalp-scanner/1.0)', accept: 'application/json' }

const cgUrl = (page: number) =>
  `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=${page}&sparkline=false&locale=en`

interface CgCoin {
  symbol?: unknown
  image?: unknown
}

let cache: { at: number; map: Record<string, string> } = { at: 0, map: {} }
let inflight: Promise<Record<string, string>> | null = null

async function fetchPage(page: number): Promise<CgCoin[]> {
  const res = await fetch(cgUrl(page), { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`icons_http_${res.status}`)
  const data: unknown = await res.json()
  if (!Array.isArray(data)) throw new Error('icons_bad_payload')
  return data as CgCoin[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function build(): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  for (const page of [1, 2]) {
    const rows = await fetchPage(page)
    for (const c of rows) {
      const sym = typeof c.symbol === 'string' ? c.symbol.trim().toLowerCase() : ''
      const img = typeof c.image === 'string' ? c.image : ''
      // first hit wins — pages arrive in market-cap order, so collisions
      // resolve to the bigger coin
      if (sym && img && !map[sym]) map[sym] = img.replace('/large/', '/small/')
    }
    if (page === 1) await sleep(1_200) // stay polite with the free rate limit
  }
  if (Object.keys(map).length === 0) throw new Error('icons_empty')
  return map
}

/** serves the cached map, refreshing it first when the TTL has expired */
export async function getIcons(): Promise<{ ok: true; updatedAt: number; icons: Record<string, string> }> {
  if (!inflight && Date.now() - cache.at > TTL) {
    inflight = build()
      .then((map) => {
        cache = { at: Date.now(), map }
        return map
      })
      .catch(() => cache.map) // stale is better than nothing
      .finally(() => {
        inflight = null
      })
  }
  if (inflight) await inflight
  return { ok: true as const, updatedAt: cache.at, icons: cache.map }
}
