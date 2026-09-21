/**
 * Single-admin password auth with an HMAC-signed cookie (30 days).
 * - ADMIN_PASSWORD env: the dashboard password (falls back to "admin" in dev
 *   with a loud warning — set it on Railway).
 * - SESSION_SECRET env: optional; defaults to a hash of the password so
 *   sessions survive restarts without extra config.
 * - Login attempts are rate-limited per IP (5 fails → 60s lockout).
 */
import crypto from 'node:crypto'
import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

const password = process.env.ADMIN_PASSWORD || 'admin'
if (!process.env.ADMIN_PASSWORD) {
  console.warn('[auth] ADMIN_PASSWORD not set — using default "admin". Set it in production!')
}
const secret = process.env.SESSION_SECRET || crypto.createHash('sha256').update(`scalp:${password}:v1`).digest('hex')

const COOKIE = 'ssid'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

function makeToken(): string {
  const exp = Date.now() + MAX_AGE_MS
  const payload = `u.${exp}`
  return `${payload}.${sign(payload)}`
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false
  const lastDot = token.lastIndexOf('.')
  if (lastDot <= 0) return false
  const payload = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  const exp = Number(payload.split('.')[1])
  return Number.isFinite(exp) && exp > Date.now()
}

// ---------------- login rate limiting (protects our own server) ----------------
const attempts = new Map<string, { fails: number; lockedUntil: number }>()
const MAX_FAILS = 5
const LOCKOUT_MS = 60_000

export function loginThrottle(ip: string): { allowed: boolean; retryAfterSec: number } {
  const rec = attempts.get(ip)
  if (rec && rec.lockedUntil > Date.now()) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) }
  }
  return { allowed: true, retryAfterSec: 0 }
}

export function recordLogin(ip: string, ok: boolean): void {
  if (ok) {
    attempts.delete(ip)
    return
  }
  const rec = attempts.get(ip) ?? { fails: 0, lockedUntil: 0 }
  rec.fails += 1
  if (rec.fails >= MAX_FAILS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS
    rec.fails = 0
  }
  attempts.set(ip, rec)
}

export function checkPassword(candidate: unknown): boolean {
  if (typeof candidate !== 'string') return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(password)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function issueSession(c: Context): void {
  setCookie(c, COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(MAX_AGE_MS / 1000),
    path: '/',
  })
}

export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' })
}

export function isAuthed(c: Context): boolean {
  return verifyToken(getCookie(c, COOKIE))
}

/** Hono middleware: 401 for unauthenticated API calls */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  if (!isAuthed(c)) return c.json({ error: 'unauthorized' }, 401)
  await next()
}
