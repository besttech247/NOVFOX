/**
 * PostgreSQL access via Drizzle. Optional: when DATABASE_URL is missing the
 * server still runs (settings/state fall back to in-memory, signal archive is
 * skipped) — but on Railway the PostgreSQL plugin provides it automatically.
 * Tables are created idempotently at boot (no migration tooling needed).
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import pg from 'pg'
import { kv, signals } from './schema'
import type { SignalRow } from './schema'

const url = process.env.DATABASE_URL

export const dbAvailable = !!url

const isInternal = !!url && (url.includes('.railway.internal') || url.includes('localhost') || url.includes('127.0.0.1'))

const sslOption =
  process.env.PGSSL === 'true'
    ? { rejectUnauthorized: false }
    : process.env.PGSSL === 'false' || isInternal
      ? undefined
      : { rejectUnauthorized: false }

const pool = url
  ? new pg.Pool({
      connectionString: url,
      ssl: sslOption,
      max: 5,
    })
  : null

if (pool) {
  pool.on('error', (err) => {
    console.error('[db] unexpected pool error:', err)
  })
}

export const db = pool ? drizzle(pool) : null

export async function initDb(): Promise<void> {
  if (!pool) {
    console.warn('[db] DATABASE_URL not set — running without persistence')
    return
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kv (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS signals (
        id text PRIMARY KEY,
        symbol text NOT NULL,
        base text NOT NULL,
        exchange text NOT NULL,
        market text NOT NULL,
        timeframe text NOT NULL,
        strength text NOT NULL,
        score integer NOT NULL,
        price real NOT NULL,
        rsi real,
        rel_vol real,
        funding_rate real,
        oi_change_pct real,
        parts jsonb NOT NULL,
        webhook_sent boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS signals_created_idx ON signals (created_at);
      CREATE INDEX IF NOT EXISTS signals_base_idx ON signals (base);
    `)
    console.log('[db] connected, tables ready')
  } catch (err) {
    console.error('[db] failed to initialize database tables:', err)
  }
}

// ---------------- kv helpers ----------------

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!db) return null
  try {
    const rows = await db.select().from(kv).where(eq(kv.key, key)).limit(1)
    return rows.length ? (rows[0].value as T) : null
  } catch (e) {
    console.warn('[db] kvGet failed:', e)
    return null
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!db) return
  try {
    await db
      .insert(kv)
      .values({ key, value: value as Record<string, unknown>, updatedAt: new Date() })
      .onConflictDoUpdate({ target: kv.key, set: { value: value as Record<string, unknown>, updatedAt: new Date() } })
  } catch (e) {
    console.warn('[db] kvSet failed:', e)
  }
}

// ---------------- signals archive ----------------

export async function insertSignals(rows: Array<typeof signals.$inferInsert>): Promise<void> {
  if (!db || rows.length === 0) return
  try {
    await db.insert(signals).values(rows).onConflictDoNothing()
  } catch (e) {
    console.warn('[db] insertSignals failed:', e)
  }
}

const RETENTION_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
let lastPurge = 0

/** purge signals older than 3 days — throttled to once per hour */
export async function purgeOldSignals(): Promise<void> {
  if (!db) return
  const now = Date.now()
  if (now - lastPurge < 60 * 60 * 1000) return
  lastPurge = now
  try {
    await db.delete(signals).where(lt(signals.createdAt, new Date(now - RETENTION_MS)))
  } catch (e) {
    console.warn('[db] purge failed:', e)
  }
}

// ---------------- history queries (archive page) ----------------

export interface HistoryQuery {
  hours: number // lookback window, clamped by caller to <= 72
  base?: string
  strength?: 'strong' | 'normal'
  timeframe?: '1m' | '5m'
  limit: number
}

/** archived signals, newest first */
export async function querySignals(q: HistoryQuery): Promise<SignalRow[]> {
  if (!db) return []
  const conds = [gte(signals.createdAt, new Date(Date.now() - q.hours * 3_600_000))]
  if (q.base) conds.push(eq(signals.base, q.base))
  if (q.strength) conds.push(eq(signals.strength, q.strength))
  if (q.timeframe) conds.push(eq(signals.timeframe, q.timeframe))
  try {
    return await db
      .select()
      .from(signals)
      .where(and(...conds))
      .orderBy(desc(signals.createdAt))
      .limit(q.limit)
  } catch (e) {
    console.warn('[db] querySignals failed:', e)
    return []
  }
}

export interface SymbolStats {
  base: string
  strong1h: number
  normal1h: number
  strong24h: number
  normal24h: number
  total24h: number
  bestScore24h: number
  lastAt: string | null // ISO
}

/** per-symbol signal counts for the last hour and last 24 hours */
export async function signalStats(): Promise<SymbolStats[]> {
  if (!pool) return []
  try {
    const r = await pool.query(`
      SELECT
        base,
        COUNT(*) FILTER (WHERE strength = 'strong' AND created_at >= now() - interval '1 hour')  AS strong_1h,
        COUNT(*) FILTER (WHERE strength = 'normal' AND created_at >= now() - interval '1 hour')  AS normal_1h,
        COUNT(*) FILTER (WHERE strength = 'strong' AND created_at >= now() - interval '24 hours') AS strong_24h,
        COUNT(*) FILTER (WHERE strength = 'normal' AND created_at >= now() - interval '24 hours') AS normal_24h,
        COUNT(*) AS total_24h,
        MAX(score) AS best_score_24h,
        MAX(created_at) AS last_at
      FROM signals
      WHERE created_at >= now() - interval '24 hours'
      GROUP BY base
      ORDER BY total_24h DESC
    `)
    return r.rows.map((row) => ({
      base: row.base as string,
      strong1h: Number(row.strong_1h),
      normal1h: Number(row.normal_1h),
      strong24h: Number(row.strong_24h),
      normal24h: Number(row.normal_24h),
      total24h: Number(row.total_24h),
      bestScore24h: Number(row.best_score_24h ?? 0),
      lastAt: row.last_at ? new Date(row.last_at).toISOString() : null,
    }))
  } catch (e) {
    console.warn('[db] signalStats failed:', e)
    return []
  }
}
