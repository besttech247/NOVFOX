/**
 * Server-driven scanner hook. The engine runs 24/7 on the server; this hook
 * subscribes to its SSE stream, mirrors the snapshot into React state, and
 * exposes control actions (start/stop, exchange, market, settings).
 * Alerts arrive as SSE events and accumulate locally (display + beep only).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  type AlertItem,
  type ConnStatus,
  type ExchangeId,
  type MarketType,
  type ScannerSettings,
  type SymbolScan,
} from '@/types'
import type { EngineSnapshot } from '@/lib/serverTypes'
import { api } from '@/lib/api'

const MAX_ALERTS = 60

let audioCtx: AudioContext | null = null

function beep(strong: boolean) {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.05)
    }
    if (strong) {
      play(880, 0, 0.18)
      play(1320, 0.16, 0.25)
    } else {
      play(660, 0, 0.15)
    }
  } catch {
    /* audio blocked until user interaction */
  }
}

export function useScanner() {
  const [running, setRunning] = useState(false)
  const [exchanges, setExchangesState] = useState<ExchangeId[]>(['bybit'])
  const [markets, setMarketsState] = useState<MarketType[]>(['futures'])
  const [market, setMarketState] = useState<MarketType>('futures')
  const [settings, setSettingsState] = useState<ScannerSettings>(DEFAULT_SETTINGS)
  const [connStalled, setConnStalled] = useState(false)
  const [status, setStatus] = useState<ConnStatus>('idle')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scans, setScans] = useState<SymbolScan[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [lastTick, setLastTick] = useState<number>(0)
  const [demo, setDemo] = useState(false)

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const applySnapshot = useCallback((snap: EngineSnapshot) => {
    setRunning(snap.running)
    if (snap.exchanges) setExchangesState(snap.exchanges)
    if (snap.markets) setMarketsState(snap.markets)
    setMarketState(snap.market)
    setSettingsState(snap.settings)
    setConnStalled(snap.connStalled)
    setStatus(snap.status)
    setLoading(snap.loading)
    setError(snap.error)
    setScans(snap.scans)
    setLastTick(snap.lastTick)
    setDemo(snap.demo)
  }, [])

  // subscribe: initial REST snapshot + live SSE stream
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const connect = () => {
      if (disposed) return
      es = new EventSource('/api/stream')
      es.addEventListener('snapshot', (e) => {
        try {
          applySnapshot(JSON.parse((e as MessageEvent).data as string) as EngineSnapshot)
        } catch {
          /* malformed event */
        }
      })
      es.addEventListener('alerts', (e) => {
        try {
          const fresh = JSON.parse((e as MessageEvent).data as string) as AlertItem[]
          setAlerts((prev) => [...fresh, ...prev].slice(0, MAX_ALERTS))
          if (settingsRef.current.sound) beep(fresh.some((a) => a.strength === 'strong'))
        } catch {
          /* malformed event */
        }
      })
      es.onerror = () => {
        es?.close()
        if (!disposed) retryTimer = setTimeout(connect, 3000)
      }
    }

    api
      .state()
      .then((snap) => {
        if (!disposed) applySnapshot(snap)
      })
      .catch(() => undefined)
    connect()

    return () => {
      disposed = true
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [applySnapshot])

  // ---------------- actions (server is the source of truth) ----------------

  const setExchanges = useCallback((e: ExchangeId[]) => {
    setExchangesState(e) // optimistic
    api.setConfig({ exchanges: e }).catch(() => undefined)
  }, [])

  const setMarkets = useCallback((m: MarketType[]) => {
    setMarketsState(m)
    if (m.length > 0) setMarketState(m[0])
    api.setConfig({ markets: m }).catch(() => undefined)
  }, [])

  const setMarket = useCallback((m: MarketType) => {
    setMarkets([m])
  }, [setMarkets])

  const setSettings = useCallback((patch: Partial<ScannerSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...patch }))
    api.saveSettings(patch).catch(() => undefined)
  }, [])

  const startScanner = useCallback(() => {
    setRunning(true)
    setLoading(true)
    api.control('start').catch(() => undefined)
  }, [])

  const stopScanner = useCallback(() => {
    setRunning(false)
    api.control('stop').catch(() => undefined)
  }, [])

  const clearAlerts = useCallback(() => setAlerts([]), [])

  return {
    running,
    startScanner,
    stopScanner,
    exchanges,
    setExchanges,
    markets,
    setMarkets,
    market,
    setMarket,
    settings,
    setSettings,
    status,
    connStalled,
    loading,
    error,
    scans,
    alerts,
    clearAlerts,
    lastTick,
    demo,
  }
}
