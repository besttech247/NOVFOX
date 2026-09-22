/**
 * Server entry point.
 * IMPORTANT: shim must be the first import (WebSocket global + polite fetch gate).
 *
 * Serves the built frontend from dist/ and mounts the API under /api.
 * Env: PORT (Railway provides it), DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET?, DEMO_MODE?
 */
import './shim'
import path from 'node:path'
import fs from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { initDb } from './db'
import { initAuth } from './auth'
import { engine } from './engine'
import { api } from './routes'

const app = new Hono()

app.route('/api', api)

// static frontend (dist/ sits next to the bundled server root in production)
const distDir = process.env.DIST_DIR || path.resolve(process.cwd(), 'dist')
if (fs.existsSync(distDir)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), distDir) || './dist' }))
  // SPA fallback — every non-API GET serves index.html
  app.get('*', serveStatic({ path: path.join(distDir, 'index.html') }))
} else {
  app.get('/', (c) => c.text('frontend not built — run `npm run build` first'))
}

async function main() {
  await initDb()
  await initAuth()
  await engine.init() // restores persisted state; auto-resumes if it was running

  const port = Number(process.env.PORT) || 3001
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}${engine.demo ? ' (DEMO MODE)' : ''}`)
  })
}

void main()
