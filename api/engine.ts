/**
 * Server-side scanner engine — a port of the browser useScanner loop that runs
 * 24/7 on the server. One global instance; start/stop controlled via API.
 * State (running/exchange/market) and settings persist in the kv table so a
 * restart resumes exactly where it left off.
 *
 * DEMO_MODE=1 replaces exchange connectivity with a synthetic seeded market —
 * used for offline development/testing only.
 */
import {
  DEFAULT_SETTINGS,
  type AlertItem,
  type Candle,
  type ConnStatus,
  type ExchangeId,
  type MarketType,
  type ScannerSettings,
  type SymbolMeta,
  type SymbolScan,
} from '@/types'
import { EXCHANGES } from '@/lib/exchanges'
import { mapPool } from '@/lib/exchanges/types'
import { evaluateSymbol } from '@/lib/signals'
import { isCommodityOrStock, isGamblingToken, isLendingToken } from '@/lib/tradfi'
import type { EngineSnapshot } from '@/lib/serverTypes'
import { insertSignals, kvGet, kvSet, purgeOldSignals } from './db'

interface SymbolEntry {
  meta: SymbolMeta
  c1: Candle[]
  c5: Candle[]
  oi: Array<{ t: number; v: number }>
}

export type { EngineSnapshot }

const KLINE_LIMIT = 200
const STATE_KV_KEY = 'engine:state:v1'
const SETTINGS_KV_KEY = 'engine:settings:v1'

interface PersistedState {
  exchanges?: ExchangeId[]
  exchange?: ExchangeId
  markets?: MarketType[]
  market?: MarketType
  running: boolean
}

// ---------------- demo mode (synthetic offline market) ----------------
const DEMO_BASES = [
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX', 'LINK', 'TON', 'ADA', 'NEAR',
  'SUI', 'DOT', 'LTC', 'UNI', 'APT', 'ARB', 'OP', 'INJ', 'ATOM', 'FIL',
  'PEPE', 'WIF', 'SEI', 'TIA', 'JUP',
]

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function demoCandles(seed: number, n: number, stepMs: number, pattern: 'pump' | 'flat' | 'dump'): Candle[] {
  const rnd = mulberry32(seed)
  const out: Candle[] = []
  const now = Date.now()
  const start = Math.floor(now / stepMs) * stepMs - n * stepMs
  let price = 50 + rnd() * 200
  for (let i = 0; i < n; i++) {
    let drift = (rnd() - 0.5) * 0.004
    if (pattern === 'pump' && i > n - 6) drift = 0.004 + rnd() * 0.004
    if (pattern === 'dump') drift -= 0.0012
    const o = price
    price = price * (1 + drift)
    const v = (pattern === 'pump' && i >= n - 3 ? 5 : 1) * (800 + rnd() * 600)
    out.push({
      t: start + i * stepMs,
      o,
      h: Math.max(o, price) * 1.0008,
      l: Math.min(o, price) * 0.9992,
      c: price,
      v,
      closed: i < n - 1,
    })
  }
  return out
}

/** live-evolving demo: every tick mutates the last candle and occasionally closes it */
function demoAdvance(entry: SymbolEntry, rnd: () => number) {
  for (const list of [entry.c1, entry.c5]) {
    const stepMs = list === entry.c1 ? 60_000 : 300_000
    const last = list[list.length - 1]
    if (!last) return
    if (Date.now() - last.t >= stepMs) {
      last.closed = true
      const o = last.c
      const drift = (rnd() - 0.48) * 0.004
      const c = o * (1 + drift)
      list.push({ t: last.t + stepMs, o, h: Math.max(o, c) * 1.0008, l: Math.min(o, c) * 0.9992, c, v: 800 + rnd() * 600, closed: false })
      if (list.length > KLINE_LIMIT + 20) list.splice(0, list.length - KLINE_LIMIT)
    } else {
      last.c = last.c * (1 + (rnd() - 0.5) * 0.001)
      last.h = Math.max(last.h, last.c)
      last.l = Math.min(last.l, last.c)
    }
  }
  entry.meta.price = entry.c1[entry.c1.length - 1]?.c ?? entry.meta.price
}

// ---------------- helpers ----------------

function oiChangePct(buf: Array<{ t: number; v: number }>, now: number): number | null {
  const recent = buf.filter((b) => now - b.t <= 30 * 60_000)
  if (recent.length < 2) return null
  const ref = recent.find((b) => now - b.t >= 14 * 60_000)
  if (!ref || ref.v === 0) return null
  return ((recent[recent.length - 1].v - ref.v) / ref.v) * 100
}

function upsertCandle(list: Candle[], candle: Candle) {
  const last = list[list.length - 1]
  if (!last || candle.t > last.t) {
    if (last) last.closed = true
    list.push(candle)
    if (list.length > KLINE_LIMIT + 20) list.splice(0, list.length - KLINE_LIMIT)
  } else if (candle.t === last.t) {
    list[list.length - 1] = candle.closed ? candle : { ...candle, closed: candle.closed || last.closed }
  }
}

type SseClient = (event: string, data: unknown) => void

class ScannerEngine {
  exchanges: ExchangeId[] = ['bybit']
  markets: MarketType[] = ['futures']
  market: MarketType = 'futures'
  settings: ScannerSettings = DEFAULT_SETTINGS
  running = false
  status: ConnStatus = 'idle'
  connStalled = false
  loading = false
  error: string | null = null
  scans: SymbolScan[] = []
  lastTick = 0
  readonly demo = process.env.DEMO_MODE === '1'

  private store = new Map<string, SymbolEntry>()
  private cooldown = new Map<string, number>()
  private webhookCooldown = new Map<string, number>()
  private seeded = false
  private clients = new Set<SseClient>()
  private disposed = false
  private bootGen = 0 // guards against stale async boots after stop/restart
  private stopWs: Array<() => void> = []
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private tickerTimer: ReturnType<typeof setInterval> | null = null
  private demoRnd = mulberry32(42)

  // ---------------- persistence ----------------

  async init(): Promise<void> {
    const state = await kvGet<PersistedState>(STATE_KV_KEY)
    if (state) {
      if (state.exchanges && state.exchanges.length > 0) {
        this.exchanges = state.exchanges
      } else if (state.exchange) {
        this.exchanges = [state.exchange]
      }
      if (state.markets && state.markets.length > 0) {
        this.markets = state.markets
        this.market = state.markets[0]
      } else if (state.market) {
        this.markets = [state.market]
        this.market = state.market
      }
      if (state.running) {
        // auto-resume after server restart
        void this.start()
      }
    }
    const settings = await kvGet<Partial<ScannerSettings>>(SETTINGS_KV_KEY)
    if (settings) this.settings = { ...DEFAULT_SETTINGS, ...settings }
  }

  private persistState(): void {
    void kvSet(STATE_KV_KEY, { exchanges: this.exchanges, markets: this.markets, market: this.market, running: this.running } satisfies PersistedState)
  }

  private persistSettings(): void {
    void kvSet(SETTINGS_KV_KEY, this.settings)
  }

  // ---------------- SSE ----------------

  addClient(fn: SseClient): () => void {
    this.clients.add(fn)
    return () => this.clients.delete(fn)
  }

  private broadcast(event: string, data: unknown): void {
    for (const fn of this.clients) {
      try {
        fn(event, data)
      } catch {
        /* client vanished */
      }
    }
  }

  snapshot(): EngineSnapshot {
    return {
      running: this.running,
      exchanges: this.exchanges,
      markets: this.markets,
      market: this.markets[0] ?? this.market,
      settings: this.settings,
      status: this.status,
      connStalled: this.connStalled,
      loading: this.loading,
      error: this.error,
      scans: this.scans,
      lastTick: this.lastTick,
      demo: this.demo,
    }
  }

  // ---------------- control ----------------

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.persistState()
    void this.boot()
    this.broadcast('snapshot', this.snapshot())
  }

  stop(): void {
    this.running = false
    this.teardown()
    this.status = 'idle'
    this.connStalled = false
    this.loading = false
    this.error = null
    this.persistState()
    this.broadcast('snapshot', this.snapshot())
  }

  private teardown(): void {
    this.bootGen++
    this.disposed = true
    this.stopWs.forEach((fn) => fn())
    this.stopWs = []
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.tickerTimer) clearInterval(this.tickerTimer)
    this.tickTimer = null
    this.tickerTimer = null
  }

  async setExchanges(exchanges: ExchangeId[]): Promise<void> {
    const current = this.exchanges.slice().sort().join(',')
    const next = exchanges.slice().sort().join(',')
    if (current === next) return
    this.exchanges = exchanges
    this.persistState()
    if (this.running) await this.restart()
    else this.broadcast('snapshot', this.snapshot())
  }

  async setMarkets(markets: MarketType[]): Promise<void> {
    const current = this.markets.slice().sort().join(',')
    const next = markets.slice().sort().join(',')
    if (current === next) return
    this.markets = markets
    this.market = markets[0] ?? 'futures'
    this.persistState()
    if (this.running) await this.restart()
    else this.broadcast('snapshot', this.snapshot())
  }

  async setMarket(market: MarketType): Promise<void> {
    return this.setMarkets([market])
  }

  async updateSettings(patch: Partial<ScannerSettings>): Promise<void> {
    const prev = this.settings
    const next: ScannerSettings = {
      ...prev,
      ...patch,
      tickMs: Math.min(5000, Math.max(500, patch.tickMs ?? prev.tickMs)),
      refreshSec: Math.min(600, Math.max(15, patch.refreshSec ?? prev.refreshSec)),
    }
    this.settings = next
    this.persistSettings()

    if (!this.running) {
      this.broadcast('snapshot', this.snapshot())
      return
    }
    if (patch.symbolCount !== undefined && patch.symbolCount !== prev.symbolCount) {
      await this.restart()
      return
    }
    // re-time the loops without a full reboot
    if (this.tickTimer && patch.tickMs !== undefined && patch.tickMs !== prev.tickMs) {
      clearInterval(this.tickTimer)
      this.tickTimer = setInterval(() => this.tick(), next.tickMs)
    }
    if (this.tickerTimer && patch.refreshSec !== undefined && patch.refreshSec !== prev.refreshSec) {
      clearInterval(this.tickerTimer)
      this.tickerTimer = setInterval(() => this.refreshMetrics(), next.refreshSec * 1000)
    }
    this.broadcast('snapshot', this.snapshot())
  }

  private async restart(): Promise<void> {
    this.teardown()
    await this.boot()
    this.broadcast('snapshot', this.snapshot())
  }

  // ---------------- lifecycle ----------------

  private async boot(): Promise<void> {
    const gen = ++this.bootGen
    this.disposed = false
    this.loading = true
    this.error = null
    this.scans = []
    this.status = 'connecting'
    this.connStalled = false
    this.store.clear()
    this.cooldown.clear()
    this.webhookCooldown.clear()
    this.seeded = false
    this.broadcast('snapshot', this.snapshot())

    const isStale = () => this.disposed || gen !== this.bootGen

    try {
      if (this.demo) {
        this.seedDemoStore()
        this.loading = false
        this.status = 'open'
      } else {
        let everOpened = false
        setTimeout(() => {
          if (!isStale() && !everOpened) {
            this.connStalled = true
            this.broadcast('snapshot', this.snapshot())
          }
        }, 30_000)

        // limit concurrent setup across all exchanges and markets
        await Promise.all(this.exchanges.flatMap((exch) =>
          this.markets.map(async (mkt) => {
            const adapter = EXCHANGES[exch]?.[mkt]
            if (!adapter) return

            try {
              const top = await adapter.fetchTopSymbols(this.settings.symbolCount)
              if (isStale()) return

              for (const m of top) {
                const meta: SymbolMeta = { ...m, exchange: exch, market: mkt }
                this.store.set(`${exch}:${mkt}:${meta.symbol}`, { meta, c1: [], c5: [], oi: [] })
              }

              // throttle history fetching to avoid IP bans
              await mapPool(top, 3, async (m) => {
                try {
                  const [c1, c5] = await Promise.all([
                    adapter.fetchKlines(m.symbol, '1m', KLINE_LIMIT),
                    adapter.fetchKlines(m.symbol, '5m', KLINE_LIMIT),
                  ])
                  const entry = this.store.get(`${exch}:${mkt}:${m.symbol}`)
                  if (entry) {
                    entry.c1 = c1
                    entry.c5 = c5
                  }
                  await new Promise((r) => setTimeout(r, 40))
                } catch {
                  /* keep empty; WS will fill */
                }
              })
              if (isStale()) return

              const stopFn = adapter.subscribe(
                top.map((m) => m.symbol),
                ['1m', '5m'],
                (ev) => {
                  const entry = this.store.get(`${exch}:${mkt}:${ev.symbol}`)
                  if (!entry) return
                  upsertCandle(ev.interval === '1m' ? entry.c1 : entry.c5, ev.candle)
                },
                (s) => {
                  if (isStale()) return
                  if (s === 'open') {
                    everOpened = true
                    this.connStalled = false
                  }
                  if (s === 'open' || this.status !== 'open') {
                    this.status = s
                  }
                  this.broadcast('snapshot', this.snapshot())
                }
              )
              this.stopWs.push(stopFn)
            } catch (err) {
              console.error(`Failed to boot ${exch}:${mkt}:`, err)
            }
          })
        ))
        if (isStale()) return
        
        this.loading = false
        this.refreshMetrics()
        this.tickerTimer = setInterval(() => this.refreshMetrics(), this.settings.refreshSec * 1000)
      }

      this.tickTimer = setInterval(() => this.tick(), this.settings.tickMs)
      this.broadcast('snapshot', this.snapshot())
    } catch (e) {
      if (!isStale()) {
        this.error = e instanceof Error ? e.message : 'fetch failed'
        this.loading = false
        this.status = 'error'
        this.broadcast('snapshot', this.snapshot())
      }
    }
  }

  private seedDemoStore(): void {
    DEMO_BASES.slice(0, this.settings.symbolCount).forEach((base, idx) => {
      const pattern = idx % 5 === 0 ? 'pump' : idx % 3 === 0 ? 'dump' : 'flat'
      const c1 = demoCandles(idx * 7 + 1, KLINE_LIMIT, 60_000, pattern)
      const c5 = demoCandles(idx * 13 + 5, KLINE_LIMIT, 300_000, pattern)
      const last = c1[c1.length - 1].c
      this.store.set(`${base}USDT`, {
        meta: {
          symbol: `${base}USDT`,
          base,
          exchange: this.exchanges[0] ?? 'bybit',
          market: 'futures',
          quoteVol24h: (5 + ((idx * 37) % 80)) * 1_000_000,
          price: last,
          change24h: ((idx * 41) % 160) / 10 - 8,
          fundingRate: (((idx * 13) % 20) - 10) / 10000,
        },
        c1,
        c5,
        oi: [],
      })
    })
  }

  private refreshMetrics(): void {
    if (this.demo) return
    const now = Date.now()

    for (const exch of this.exchanges) {
      for (const mkt of this.markets) {
        const adapter = EXCHANGES[exch]?.[mkt]
        if (!adapter) continue

        adapter
          .fetchTopSymbols(this.settings.symbolCount)
          .then((fresh) => {
            for (const m of fresh) {
              const entry = this.store.get(`${exch}:${mkt}:${m.symbol}`)
              if (entry) {
                entry.meta = { ...entry.meta, quoteVol24h: m.quoteVol24h, change24h: m.change24h }
              }
            }
          })
          .catch(() => undefined)

        if (adapter.fetchFuturesMetrics) {
          const exchSymbols: string[] = []
          for (const entry of this.store.values()) {
            if (entry.meta.exchange === exch && entry.meta.market === mkt) {
              exchSymbols.push(entry.meta.symbol)
            }
          }

          if (exchSymbols.length > 0) {
            adapter
              .fetchFuturesMetrics(exchSymbols)
              .then((metrics) => {
                for (const [symbol, m] of metrics) {
                  const entry = this.store.get(`${exch}:${mkt}:${symbol}`)
                  if (!entry) continue
                  if (m.fundingRate != null) entry.meta = { ...entry.meta, fundingRate: m.fundingRate }
                  if (m.openInterest != null && m.openInterest > 0) {
                    entry.oi.push({ t: now, v: m.openInterest })
                    if (entry.oi.length > 40) entry.oi.splice(0, entry.oi.length - 40)
                  }
                }
              })
              .catch(() => undefined)
          }
        }
      }
    }
  }

  // ---------------- compute loop ----------------

  private tick(): void {
    if (!this.running || this.disposed) return
    const s = this.settings

    if (this.demo) {
      for (const entry of this.store.values()) demoAdvance(entry, this.demoRnd)
    }

    const out: SymbolScan[] = []
    for (const entry of this.store.values()) {
      if (entry.c1.length === 0) continue
      if (s.hideTradFi && isCommodityOrStock(entry.meta.base, entry.meta.symbol)) continue
      if (s.hideLending && isLendingToken(entry.meta.base, entry.meta.symbol)) continue
      if (s.hideGambling && isGamblingToken(entry.meta.base, entry.meta.symbol)) continue
      const lastPrice = entry.c1[entry.c1.length - 1]?.c ?? entry.meta.price
      const meta = { ...entry.meta, price: lastPrice }
      const primary = s.primaryTf === '1m' ? entry.c1 : entry.c5
      const trend = s.primaryTf === '1m' ? entry.c5 : []
      const extras = {
        fundingRate: entry.meta.fundingRate ?? null,
        oiChangePct: oiChangePct(entry.oi, Date.now()),
      }
      const scan = evaluateSymbol(meta, primary, trend, s, extras)
      scan.meta = { ...scan.meta, fundingRate: entry.meta.fundingRate ?? null, oiChangePct: extras.oiChangePct }
      out.push(scan)
    }
    out.sort((a, b) => {
      if (a.passesFilters !== b.passesFilters) return a.passesFilters ? -1 : 1
      return b.score - a.score
    })
    this.scans = out
    this.lastTick = Date.now()

    // alerts with per-symbol cooldown
    const now = Date.now()
    const cooldownMs = Math.max(1, s.cooldownMin ?? 5) * 60_000
    const fresh: AlertItem[] = []
    for (const scan of out) {
      if (scan.strength === 'none') continue
      const unifiedSymbol = `${scan.meta.base.toUpperCase()}USDT`
      const key = `${scan.meta.exchange}:${scan.meta.market}:${scan.meta.symbol}`
      const lastAlertAt = this.cooldown.get(key) ?? 0
      if (!this.seeded) {
        this.cooldown.set(key, now) // seed silently on first pass
        continue
      }
      if (now - lastAlertAt < cooldownMs) continue
      this.cooldown.set(key, now) // Record alert timestamp to prevent continuous sending

      fresh.push({
        id: `${key}-${now}`,
        symbol: unifiedSymbol,
        base: scan.meta.base,
        exchange: scan.meta.exchange,
        market: scan.meta.market,
        timeframe: s.primaryTf,
        score: scan.score,
        strength: scan.strength,
        price: scan.meta.price,
        parts: scan.parts.filter((p) => p.points > 0).map((p) => p.label),
        time: now,
      })
    }

    if (fresh.length > 0) {
      this.broadcast('alerts', fresh.reverse())
      const hookReady = this.settings.webhookOn && /^https?:\/\//i.test(this.settings.webhookUrl.trim())
      void this.archiveAlerts(fresh, hookReady)
      if (hookReady) {
        for (const a of fresh) {
          const lastHookAt = this.webhookCooldown.get(a.symbol) ?? 0
          if (now - lastHookAt >= cooldownMs) {
            this.webhookCooldown.set(a.symbol, now)
            void this.postWebhook(this.signalPayload(a, 'signal'))
          }
        }
      }
    }
    this.seeded = true
    this.broadcast('snapshot', this.snapshot())
  }

  private async archiveAlerts(fresh: AlertItem[], webhookSent = false): Promise<void> {
    const scansByBase = new Map(this.scans.map((sc) => [`${sc.meta.exchange}:${sc.meta.market}:${sc.meta.base.toUpperCase()}`, sc]))
    await insertSignals(
      fresh.map((a) => {
        const sc = scansByBase.get(`${a.exchange}:${a.market ?? 'futures'}:${a.base.toUpperCase()}`)
        return {
          id: a.id,
          symbol: `${a.base.toUpperCase()}USDT`,
          base: a.base,
          exchange: a.exchange,
          market: this.market,
          timeframe: a.timeframe,
          strength: a.strength,
          score: a.score,
          price: a.price,
          rsi: sc?.rsi ?? null,
          relVol: sc?.relVol ?? null,
          fundingRate: sc?.meta.fundingRate ?? null,
          oiChangePct: sc?.meta.oiChangePct ?? null,
          parts: a.parts,
          webhookSent,
        }
      }),
    )
    void purgeOldSignals()
  }

  // ---------------- custom webhook ----------------

  /** JSON payload sent to the user's webhook for one signal */
  private signalPayload(
    a: { symbol: string; base: string; exchange: ExchangeId; timeframe: string; strength: string; score: number; price: number; parts: string[]; time: number },
    event: 'signal' | 'manual' | 'test',
  ): Record<string, unknown> {
    const unifiedSymbol = `${a.base.toUpperCase()}USDT`
    return {
      event,
      symbol: unifiedSymbol,
      base: a.base.toUpperCase(),
      exchange: a.exchange,
      market: this.market,
      timeframe: a.timeframe,
      strength: a.strength,
      score: a.score,
      price: a.price,
      parts: a.parts,
      time: a.time,
    }
  }

  private async postWebhook(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number }> {
    const url = this.settings.webhookUrl.trim()
    if (!/^https?:\/\//i.test(url)) return { ok: false, status: 0 }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      })
      return { ok: res.ok, status: res.status }
    } catch {
      return { ok: false, status: 0 }
    }
  }

  /** settings "test" button — verifies the configured URL accepts POSTs */
  async testWebhook(): Promise<{ ok: boolean; status: number }> {
    return this.postWebhook({
      event: 'test',
      symbol: 'WLDUSDT',
      base: 'WLD',
      message: 'اختبار ويب هوك من سكانر السكالبنغ NOVFOX',
      time: Date.now(),
    })
  }

  /** manual per-symbol send from the UI — works even when auto-send is off */
  async sendWebhookFor(symbol: string): Promise<{ ok: boolean; status: number } | 'not_found'> {
    const cleanSym = symbol.trim().toUpperCase()
    const cleanBase = cleanSym.replace(/[-_]SWAP$/i, '').replace(/[-_]PERP$/i, '').replace(/[-_]?USDT$/i, '')
    const scan = this.scans.find(
      (s) =>
        s.meta.symbol.toUpperCase() === cleanSym ||
        s.meta.base.toUpperCase() === cleanSym ||
        s.meta.base.toUpperCase() === cleanBase ||
        `${s.meta.base.toUpperCase()}USDT` === cleanSym
    )
    if (!scan) return 'not_found'
    return this.postWebhook(
      this.signalPayload(
        {
          symbol: `${scan.meta.base.toUpperCase()}USDT`,
          base: scan.meta.base,
          exchange: scan.meta.exchange,
          timeframe: this.settings.primaryTf,
          strength: scan.strength,
          score: scan.score,
          price: scan.meta.price,
          parts: scan.parts.filter((p) => p.points > 0).map((p) => p.label),
          time: Date.now(),
        },
        'manual',
      ),
    )
  }
}

export const engine = new ScannerEngine()
