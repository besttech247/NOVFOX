/**
 * REST + SSE API. Plain Hono routes (not tRPC) — the surface is small and the
 * SSE stream doesn't fit RPC. All routes except /api/login require the auth cookie.
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  checkPassword,
  clearSession,
  issueSession,
  isAuthed,
  loginThrottle,
  recordLogin,
  requireAuth,
} from './auth'
import { engine } from './engine'
import { dbAvailable, querySignals, signalStats } from './db'
import { getCalendar, getNews } from './news'
import { getIcons } from './icons'
import type { ExchangeId, MarketType, ScannerSettings } from '@/types'

export const api = new Hono()

// ---------------- public ----------------

api.post('/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const throttle = loginThrottle(ip)
  if (!throttle.allowed) {
    return c.json({ error: 'locked', retryAfterSec: throttle.retryAfterSec }, 429)
  }
  let body: { password?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  if (!checkPassword(body.password)) {
    recordLogin(ip, false)
    return c.json({ error: 'wrong_password' }, 401)
  }
  recordLogin(ip, true)
  issueSession(c)
  return c.json({ ok: true })
})

api.post('/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

api.get('/me', (c) => {
  return isAuthed(c) ? c.json({ ok: true }) : c.json({ error: 'unauthorized' }, 401)
})

// ---------------- protected ----------------

api.use('/state', requireAuth)
api.use('/control', requireAuth)
api.use('/settings', requireAuth)
api.use('/config', requireAuth)
api.use('/stream', requireAuth)
api.use('/history/*', requireAuth)
api.use('/webhook/*', requireAuth)
api.use('/econ/*', requireAuth)
api.use('/icons', requireAuth)

api.post('/webhook/test', async (c) => {
  if (!engine.settings.webhookUrl.trim()) return c.json({ error: 'no_webhook' }, 400)
  const r = await engine.testWebhook()
  return c.json(r, r.ok ? 200 : 502)
})

api.post('/webhook/send', async (c) => {
  if (!engine.settings.webhookUrl.trim()) return c.json({ error: 'no_webhook' }, 400)
  let body: { symbol?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  if (typeof body.symbol !== 'string' || !body.symbol.trim()) return c.json({ error: 'bad_request' }, 400)
  const r = await engine.sendWebhookFor(body.symbol.trim())
  if (r === 'not_found') return c.json({ error: 'symbol_not_found' }, 404)
  return c.json(r, r.ok ? 200 : 502)
})

const clampNum = (v: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

api.get('/history/signals', async (c) => {
  if (!dbAvailable) return c.json({ signals: [], dbAvailable: false })
  const hours = clampNum(Number(c.req.query('hours')), 1, 72, 24)
  const limit = clampNum(Number(c.req.query('limit')), 1, 500, 200)
  const baseRaw = (c.req.query('base') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
  const strengthRaw = c.req.query('strength')
  const tfRaw = c.req.query('timeframe')
  const rows = await querySignals({
    hours,
    limit,
    base: baseRaw || undefined,
    strength: strengthRaw === 'strong' || strengthRaw === 'normal' ? strengthRaw : undefined,
    timeframe: tfRaw === '1m' || tfRaw === '5m' ? tfRaw : undefined,
  })
  return c.json({ signals: rows, dbAvailable: true })
})

api.get('/history/stats', async (c) => {
  if (!dbAvailable) return c.json({ stats: [], dbAvailable: false })
  return c.json({ stats: await signalStats(), dbAvailable: true })
})

// economic calendar + crypto news (server-cached, no API keys needed)
api.get('/econ/calendar', async (c) => c.json(await getCalendar()))
api.get('/econ/news', async (c) => c.json(await getNews()))

// coin logos: symbol → image URL map (server-cached from CoinGecko)
api.get('/icons', async (c) => c.json(await getIcons()))

api.get('/state', (c) => c.json(engine.snapshot()))

api.post('/control', async (c) => {
  let body: { action?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  if (body.action === 'start') {
    await engine.start()
  } else if (body.action === 'stop') {
    engine.stop()
  } else {
    return c.json({ error: 'bad_action' }, 400)
  }
  return c.json(engine.snapshot())
})

api.post('/settings', async (c) => {
  let body: Partial<ScannerSettings>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  await engine.updateSettings(body)
  return c.json(engine.snapshot())
})

api.post('/config', async (c) => {
  let body: { exchanges?: ExchangeId[]; markets?: MarketType[]; market?: MarketType }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  if (Array.isArray(body.exchanges)) {
    const valid = ['binance', 'bybit', 'kucoin', 'okx', 'kraken', 'coinbase', 'hyperliquid'] as ExchangeId[]
    const filtered = body.exchanges.filter(e => valid.includes(e))
    if (filtered.length > 0) {
      await engine.setExchanges(filtered)
    }
  }
  if (Array.isArray(body.markets)) {
    const validMarkets = ['spot', 'futures'] as MarketType[]
    const filteredM = body.markets.filter(m => validMarkets.includes(m))
    if (filteredM.length > 0) {
      await engine.setMarkets(filteredM)
    }
  } else if (body.market === 'spot' || body.market === 'futures') {
    await engine.setMarkets([body.market])
  }
  return c.json(engine.snapshot())
})

api.get('/stream', (c) => {
  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) => {
      void stream.writeSSE({ event, data: JSON.stringify(data) })
    }
    const unsubscribe = engine.addClient(send)
    // initial snapshot so late joiners catch up immediately
    await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(engine.snapshot()) })
    // heartbeat keeps proxies from killing the connection
    const heartbeat = setInterval(() => {
      void stream.writeSSE({ event: 'ping', data: String(Date.now()) })
    }, 25_000)
    stream.onAbort(() => {
      clearInterval(heartbeat)
      unsubscribe()
    })
    // keep the handler alive — hono closes the stream when this callback returns
    await new Promise(() => {})
  })
})
