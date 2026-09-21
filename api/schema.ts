import { pgTable, text, integer, real, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'

/** persisted scanner/engine state & settings (single-row key-value) */
export const kv = pgTable('kv', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** signal events worth remembering (normal + strong, post-cooldown) — auto-purged after 3 days */
export const signals = pgTable(
  'signals',
  {
    id: text('id').primaryKey(),
    symbol: text('symbol').notNull(),
    base: text('base').notNull(),
    exchange: text('exchange').notNull(),
    market: text('market').notNull(), // spot | futures
    timeframe: text('timeframe').notNull(), // 1m | 5m
    strength: text('strength').notNull(), // strong | normal
    score: integer('score').notNull(),
    price: real('price').notNull(),
    rsi: real('rsi'),
    relVol: real('rel_vol'),
    fundingRate: real('funding_rate'),
    oiChangePct: real('oi_change_pct'),
    parts: jsonb('parts').notNull(), // string[]
    webhookSent: boolean('webhook_sent').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('signals_created_idx').on(t.createdAt), index('signals_base_idx').on(t.base)],
)

export type SignalRow = typeof signals.$inferSelect
