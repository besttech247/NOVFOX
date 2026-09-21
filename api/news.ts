/**
 * Economic calendar + crypto news, fetched server-side.
 * Why server-side: browser CORS would block these sources, and one cached
 * fetch serves every open client. No API keys required.
 *
 *  - Macro calendar: ForexFactory weekly XML feed (times are US Eastern)
 *  - Crypto news:    CryptoCompare free API, CoinTelegraph RSS as fallback
 */

export interface EconEvent {
  id: string
  title: string
  currency: string
  impact: 'high' | 'medium' | 'low' | 'holiday'
  at: number // unix ms (UTC)
  allDay: boolean
  forecast: string
  previous: string
}

export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  categories: string[]
  at: number // unix ms
}

const CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml'
const CAL_TTL = 30 * 60_000 // feed covers the whole week; 30-min refresh is plenty
const NEWS_URL = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN'
const NEWS_RSS = 'https://cointelegraph.com/rss'
const NEWS_TTL = 5 * 60_000
const FETCH_HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; scalp-scanner/1.0)' }

// ---------- tiny XML helpers ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

/** pull one tag's text out of an XML fragment (CDATA-aware) */
function xmlTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))
  return m ? decodeEntities(m[1].trim()) : ''
}

// ---------- US Eastern wall-clock -> UTC ----------

/** offset (ms) of America/New_York local time ahead of UTC at the given instant */
function nyOffsetMs(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return wallAsUtc - utcMs
}

/** convert a wall-clock time in New York to a UTC timestamp (DST-safe) */
function nyToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const off1 = nyOffsetMs(guess)
  const utc = guess - off1
  const off2 = nyOffsetMs(utc)
  return off2 === off1 ? utc : guess - off2
}

// ---------- calendar ----------

function parseCalendar(xml: string): EconEvent[] {
  const out: EconEvent[] = []
  const seen = new Set<string>()
  for (const chunk of xml.split('<event>').slice(1)) {
    const end = chunk.indexOf('</event>')
    const block = end === -1 ? chunk : chunk.slice(0, end)
    const title = xmlTag(block, 'title')
    const currency = xmlTag(block, 'country').toUpperCase()
    const dateStr = xmlTag(block, 'date') // MM-DD-YYYY
    const timeStr = xmlTag(block, 'time') // "8:30am" | "All Day" | "Tentative"
    const impactRaw = xmlTag(block, 'impact').toLowerCase()
    const dm = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (!title || !currency || !dm) continue
    const mo = Number(dm[1])
    const d = Number(dm[2])
    const y = Number(dm[3])
    const tm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
    let h = 0
    let mi = 0
    const allDay = !tm
    if (tm) {
      h = Number(tm[1]) % 12
      if (tm[3].toLowerCase() === 'pm') h += 12
      mi = Number(tm[2])
    }
    const at = nyToUtc(y, mo, d, h, mi)
    const impact: EconEvent['impact'] =
      impactRaw === 'high' ? 'high' : impactRaw === 'medium' ? 'medium' : impactRaw === 'holiday' ? 'holiday' : 'low'
    const id = `${currency}-${title}-${at}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      title,
      currency,
      impact,
      at,
      allDay,
      forecast: xmlTag(block, 'forecast'),
      previous: xmlTag(block, 'previous'),
    })
  }
  return out.sort((a, b) => a.at - b.at)
}

// ---------- news ----------

function parseCryptoCompare(json: string): NewsItem[] {
  const data = (JSON.parse(json) as { Data?: unknown[] }).Data ?? []
  const out: NewsItem[] = []
  for (const raw of data) {
    const it = raw as Record<string, unknown>
    if (typeof it.title !== 'string' || typeof it.url !== 'string' || !it.title || !it.url) continue
    out.push({
      id: String(it.id ?? it.url),
      title: it.title,
      url: it.url,
      source: typeof it.source === 'string' ? it.source : 'crypto',
      categories: typeof it.categories === 'string' ? it.categories.split('|').slice(0, 3) : [],
      at: Number(it.published_on ?? 0) * 1000,
    })
  }
  return out.filter((n) => n.at > 0)
}

function parseRss(xml: string): NewsItem[] {
  const out: NewsItem[] = []
  for (const chunk of xml.split('<item>').slice(1)) {
    const end = chunk.indexOf('</item>')
    const block = end === -1 ? chunk : chunk.slice(0, end)
    const title = xmlTag(block, 'title')
    const url = xmlTag(block, 'link')
    const at = Date.parse(xmlTag(block, 'pubDate'))
    if (!title || !url || !Number.isFinite(at)) continue
    out.push({ id: url, title, url, source: 'cointelegraph', categories: [], at })
  }
  return out
}

// ---------- cached fetchers ----------

interface Cache<T> {
  at: number
  data: T
}

let calCache: Cache<EconEvent[]> | null = null
let newsCache: Cache<NewsItem[]> | null = null

export async function getCalendar(): Promise<{ ok: boolean; updatedAt: number; events: EconEvent[] }> {
  if (calCache && Date.now() - calCache.at < CAL_TTL) {
    return { ok: true, updatedAt: calCache.at, events: calCache.data }
  }
  try {
    const res = await fetch(CAL_URL, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`calendar_http_${res.status}`)
    const events = parseCalendar(await res.text())
    if (events.length === 0) throw new Error('calendar_empty')
    calCache = { at: Date.now(), data: events }
    return { ok: true, updatedAt: calCache.at, events }
  } catch {
    // degrade to stale data rather than an empty screen
    if (calCache) return { ok: true, updatedAt: calCache.at, events: calCache.data }
    return { ok: false, updatedAt: 0, events: [] }
  }
}

export async function getNews(): Promise<{ ok: boolean; updatedAt: number; items: NewsItem[] }> {
  if (newsCache && Date.now() - newsCache.at < NEWS_TTL) {
    return { ok: true, updatedAt: newsCache.at, items: newsCache.data }
  }
  let items: NewsItem[] | null = null
  try {
    const res = await fetch(NEWS_URL, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10_000) })
    if (res.ok) items = parseCryptoCompare(await res.text())
  } catch {
    /* fall through to RSS fallback */
  }
  if (!items || items.length === 0) {
    try {
      const res = await fetch(NEWS_RSS, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10_000) })
      if (res.ok) items = parseRss(await res.text())
    } catch {
      /* stale cache below */
    }
  }
  if (items && items.length > 0) {
    items.sort((a, b) => b.at - a.at)
    newsCache = { at: Date.now(), data: items.slice(0, 40) }
    return { ok: true, updatedAt: newsCache.at, items: newsCache.data }
  }
  if (newsCache) return { ok: true, updatedAt: newsCache.at, items: newsCache.data }
  return { ok: false, updatedAt: 0, items: [] }
}
