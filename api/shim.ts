/**
 * Server bootstrap shims — must be imported BEFORE anything that touches WebSocket/fetch.
 * 1. Provides global WebSocket (Node 20 lacks it) via the `ws` package.
 * 2. Wraps global fetch with a polite per-host rate gate for exchange APIs,
 *    protecting our server IP from bans (min interval + jitter + 429/418 backoff).
 */
import WS from 'ws'

if (typeof globalThis.WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).WebSocket = WS
}

// ---------------- polite rate gate ----------------
interface HostGate {
  minIntervalMs: number
  lastAt: number
  backoffUntil: number
}

const gates = new Map<string, HostGate>()
const GATED_HOSTS = ['binance.com', 'bybit.com', 'kucoin.com']
const DEFAULT_MIN_INTERVAL = 80 // ms between requests per host

function gateFor(host: string): HostGate | null {
  const key = GATED_HOSTS.find((h) => host.endsWith(h))
  if (!key) return null
  let g = gates.get(key)
  if (!g) {
    g = { minIntervalMs: DEFAULT_MIN_INTERVAL, lastAt: 0, backoffUntil: 0 }
    gates.set(key, g)
  }
  return g
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const nativeFetch = globalThis.fetch.bind(globalThis)

async function gatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return nativeFetch(input, init)
  }
  const gate = gateFor(host)
  if (!gate) return nativeFetch(input, init)

  for (let attempt = 0; attempt < 3; attempt++) {
    // respect backoff window after a 418/429
    const now = Date.now()
    if (gate.backoffUntil > now) await sleep(gate.backoffUntil - now)

    // minimum spacing + jitter
    const elapsed = Date.now() - gate.lastAt
    const wait = gate.minIntervalMs + Math.random() * 40 - elapsed
    if (wait > 0) await sleep(wait)
    gate.lastAt = Date.now()

    const res = await nativeFetch(input, init)
    if (res.status === 429 || res.status === 418) {
      // escalate: back off exponentially, and slow the host down going forward
      gate.minIntervalMs = Math.min(1000, gate.minIntervalMs * 2)
      gate.backoffUntil = Date.now() + (attempt + 1) * 15_000
      continue
    }
    // healthy response → ease the gate back toward the default
    gate.minIntervalMs = Math.max(DEFAULT_MIN_INTERVAL, gate.minIntervalMs * 0.9)
    return res
  }
  // final attempt without gate gymnastics
  return nativeFetch(input, init)
}

globalThis.fetch = gatedFetch as typeof fetch
