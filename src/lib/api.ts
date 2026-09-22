/**
 * Thin client for the scanner server API. All requests carry the auth cookie.
 * On any 401 the app is notified so it can bounce back to the login screen.
 */
import type { ArchivedSignal, EconEvent, EngineSnapshot, NewsItem, SymbolStats } from './serverTypes'
import type { ExchangeId, MarketType, ScannerSettings } from '@/types'

export class ApiError extends Error {
  status: number
  payload?: unknown
  constructor(status: number, message: string, payload?: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:required'))
    throw new ApiError(401, 'unauthorized')
  }
  if (!res.ok) {
    let payload: unknown
    try {
      payload = await res.json()
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, res.statusText, payload)
  }
  return (await res.json()) as T
}

export const api = {
  login: (password: string) => apiFetch<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => apiFetch<{ ok: true }>('/api/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: true }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  me: () => apiFetch<{ ok: true }>('/api/me'),
  state: () => apiFetch<EngineSnapshot>('/api/state'),
  control: (action: 'start' | 'stop') =>
    apiFetch<EngineSnapshot>('/api/control', { method: 'POST', body: JSON.stringify({ action }) }),
  saveSettings: (patch: Partial<ScannerSettings>) =>
    apiFetch<EngineSnapshot>('/api/settings', { method: 'POST', body: JSON.stringify(patch) }),
  setConfig: (patch: { exchanges?: ExchangeId[]; markets?: MarketType[]; market?: MarketType }) =>
    apiFetch<EngineSnapshot>('/api/config', { method: 'POST', body: JSON.stringify(patch) }),
  historySignals: (params: { hours?: number; base?: string; strength?: string; timeframe?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params.hours) qs.set('hours', String(params.hours))
    if (params.base) qs.set('base', params.base)
    if (params.strength) qs.set('strength', params.strength)
    if (params.timeframe) qs.set('timeframe', params.timeframe)
    if (params.limit) qs.set('limit', String(params.limit))
    return apiFetch<{ signals: ArchivedSignal[]; dbAvailable: boolean }>(`/api/history/signals?${qs}`)
  },
  historyStats: () => apiFetch<{ stats: SymbolStats[]; dbAvailable: boolean }>('/api/history/stats'),
  webhookTest: () => apiFetch<{ ok: boolean; status: number }>('/api/webhook/test', { method: 'POST' }),
  webhookSend: (symbol: string) =>
    apiFetch<{ ok: boolean; status: number }>('/api/webhook/send', { method: 'POST', body: JSON.stringify({ symbol }) }),
  econCalendar: () => apiFetch<{ ok: boolean; updatedAt: number; events: EconEvent[] }>('/api/econ/calendar'),
  econNews: () => apiFetch<{ ok: boolean; updatedAt: number; items: NewsItem[] }>('/api/econ/news'),
  icons: () => apiFetch<{ ok: boolean; updatedAt: number; icons: Record<string, string> }>('/api/icons'),
}
