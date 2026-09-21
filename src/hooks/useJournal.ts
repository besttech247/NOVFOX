import { useCallback, useState } from 'react'
import type { ExchangeId } from '@/types'

export interface JournalEntry {
  id: string
  symbol: string
  base: string
  exchange: ExchangeId
  entryPrice: number
  entryTime: number
  score: number
  parts: string[]
  exitPrice?: number
  exitTime?: number
}

const KEY = 'scalp-scanner-journal-v1'

function load(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as JournalEntry[]
  } catch {
    /* ignore */
  }
  return []
}

function save(entries: JournalEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* ignore */
  }
}

export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>(load)

  const addEntry = useCallback((e: Omit<JournalEntry, 'id' | 'entryTime'>) => {
    setEntries((prev) => {
      const next = [{ ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, entryTime: Date.now() }, ...prev]
      save(next)
      return next
    })
  }, [])

  const closeEntry = useCallback((id: string, exitPrice: number) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, exitPrice, exitTime: Date.now() } : e))
      save(next)
      return next
    })
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id)
      save(next)
      return next
    })
  }, [])

  const clearClosed = useCallback(() => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.exitPrice === undefined)
      save(next)
      return next
    })
  }, [])

  return { entries, addEntry, closeEntry, removeEntry, clearClosed }
}

export function journalStats(entries: JournalEntry[]) {
  const closed = entries.filter((e) => e.exitPrice !== undefined)
  const pnls = closed.map((e) => ((e.exitPrice! - e.entryPrice) / e.entryPrice) * 100)
  const wins = pnls.filter((p) => p > 0)
  return {
    open: entries.filter((e) => e.exitPrice === undefined).length,
    closed: closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    netPnl: pnls.reduce((a, b) => a + b, 0),
    best: pnls.length ? Math.max(...pnls) : 0,
    worst: pnls.length ? Math.min(...pnls) : 0,
  }
}
