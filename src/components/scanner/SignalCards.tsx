import { useMemo, useState } from 'react'
import type { SymbolScan } from '@/types'
import { fmtPct, fmtPrice, fmtVol } from '@/lib/format'
import { getTradingViewUrl } from '@/lib/tradingview'
import { Sparkline } from './Sparkline'
import { CoinIcon } from '@/components/CoinIcon'
import { ExchangeIcon } from '@/components/ExchangeIcon'
import { CopyButton } from '@/components/CopyButton'
import { useWebhookSend, WebhookSendButton, type SendState } from './SignalTable'
import { ChevronDown, Flame, LogIn, TrendingUp, Zap } from 'lucide-react'

function Card({
  primary,
  items,
  onEnter,
  webhookReady,
  sendState,
  onSend,
  icons,
}: {
  primary: SymbolScan
  items: SymbolScan[]
  onEnter?: (s: SymbolScan) => void
  webhookReady?: boolean
  sendState?: SendState
  onSend?: (symbol: string) => void
  icons: Record<string, string>
}) {
  const [expanded, setExpanded] = useState(false)
  const s = primary
  const isFutures = s.meta.market === 'futures'
  const dim = !s.passesFilters

  const ring =
    s.strength === 'strong'
      ? isFutures
        ? 'border-purple-500/50 shadow-[0_0_18px_rgba(168,85,247,0.15)]'
        : 'border-[#00d9a3]/50 shadow-[0_0_18px_rgba(0,217,163,0.15)]'
      : s.strength === 'normal'
        ? 'border-[#f5c518]/30'
        : 'border-zinc-800/80'

  const marketAccent = isFutures ? 'border-s-4 border-s-purple-500/80' : 'border-s-4 border-s-emerald-500/80'

  return (
    <div className={`rounded-lg border bg-[#121214] p-3 transition-colors ${ring} ${marketAccent} ${dim ? 'opacity-40' : ''}`}>
      {/* Top row: symbol + exchange icon only + market badge + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CoinIcon base={s.meta.base} icons={icons} size={22} />
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-zinc-100">{s.meta.base}</span>
              <CopyButton text={s.meta.base} size={11} />

              {/* Exchange Icon Only */}
              <ExchangeIcon exchange={s.meta.exchange} size={14} className="rounded-sm" />

              {/* Market Badge */}
              <span
                className={`rounded px-1 py-0.2 text-[8px] font-bold border ${
                  isFutures
                    ? 'border-purple-500/40 bg-purple-500/15 text-purple-300'
                    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                }`}
              >
                {isFutures ? 'PERP' : 'SPOT'}
              </span>

              {s.trendUp && <TrendingUp size={11} className="text-[#00d9a3]/70" />}

              {/* Expand Counter Toggle */}
              {items.length > 1 && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="ms-1 inline-flex items-center gap-0.5 rounded bg-zinc-800/80 px-1 py-0.5 text-[9px] font-medium text-zinc-400 hover:bg-zinc-700"
                >
                  <span>+{items.length - 1}</span>
                  <ChevronDown
                    size={10}
                    className={`transition-transform duration-200 ${expanded ? 'rotate-180 text-[#00d9a3]' : ''}`}
                  />
                </button>
              )}
            </div>
            <span className="text-[10px] text-zinc-600 font-num">{fmtVol(s.meta.quoteVol24h)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {s.strength === 'strong' ? (
            <span title="إشارة قوية" className="inline-flex items-center justify-center rounded border border-[#00d9a3]/40 bg-[#00d9a3]/10 p-1 text-[#00d9a3]">
              <Flame size={12} />
            </span>
          ) : s.strength === 'normal' ? (
            <span title="إشارة عادية" className="inline-flex items-center justify-center rounded border border-[#f5c518]/30 bg-[#f5c518]/10 p-1 text-[#f5c518]">
              <Zap size={12} />
            </span>
          ) : null}

          {onEnter && s.strength !== 'none' && (
            <button
              onClick={() => onEnter(s)}
              title="تسجيل دخول الصفقة في اليومية"
              className="inline-flex items-center justify-center rounded border border-zinc-700 p-1 text-zinc-400 transition-colors hover:border-[#00d9a3]/50 hover:text-[#00d9a3]"
            >
              <LogIn size={11} />
            </button>
          )}

          {webhookReady && sendState && onSend && (
            <WebhookSendButton symbol={`${s.meta.base.toUpperCase()}USDT`} sendState={sendState} onSend={onSend} />
          )}

          <a
            href={getTradingViewUrl(s.meta.exchange, s.meta.symbol, s.meta.base, s.meta.market)}
            target="_blank"
            rel="noreferrer"
            title="فتح في TradingView"
            className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-[#3179f5]/50 hover:text-[#3179f5]"
          >
            TV
          </a>
        </div>
      </div>

      {/* Price + Change + Score */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="font-num text-lg font-bold tabular-nums text-zinc-50" dir="ltr">
            {fmtPrice(s.meta.price)}
          </div>
          <div
            className={`font-num text-xs tabular-nums ${
              (s.meta.changeDaily ?? s.meta.change24h) >= 0 ? 'text-[#00d9a3]' : 'text-[#ff4d4d]'
            }`}
            dir="ltr"
            title={s.meta.openDaily != null ? `افتتاح اليوم: ${fmtPrice(s.meta.openDaily)}` : 'نسبة التغير اليومي'}
          >
            {fmtPct(s.meta.changeDaily ?? s.meta.change24h)}
          </div>
        </div>

        {/* Score bar */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5" dir="ltr">
            <span
              className="font-num text-sm font-bold tabular-nums"
              style={{
                color: s.strength === 'strong' ? '#00d9a3' : s.strength === 'normal' ? '#f5c518' : '#71717a',
              }}
            >
              {s.score}
            </span>
            <span className="text-[10px] text-zinc-500">نقاط</span>
          </div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800" dir="ltr">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${s.score}%`,
                background: s.strength === 'strong' ? '#00d9a3' : s.strength === 'normal' ? '#f5c518' : '#3f3f46',
              }}
            />
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mt-2.5 grid grid-cols-4 gap-1.5 rounded-md bg-zinc-900/60 p-2 text-center text-xs">
        <div>
          <span className="text-[10px] text-zinc-500">RSI</span>
          <div
            className={`font-num font-semibold ${
              s.rsi != null
                ? s.rsi >= 70
                  ? 'text-[#ff4d4d]'
                  : s.rsi <= 30
                    ? 'text-[#00d9a3]'
                    : 'text-zinc-300'
                : 'text-zinc-600'
            }`}
          >
            {s.rsi != null ? s.rsi.toFixed(1) : '—'}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500">الحجم ×</span>
          <div
            className={`font-num font-semibold ${
              s.relVol != null && s.relVol >= 2
                ? 'text-[#f5c518]'
                : s.relVol != null && s.relVol >= 1.2
                  ? 'text-zinc-200'
                  : 'text-zinc-500'
            }`}
          >
            {s.relVol != null ? `${s.relVol.toFixed(1)}×` : '—'}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500">VWAP</span>
          <div
            className={`font-num font-semibold ${
              s.vwapDistPct != null
                ? s.vwapDistPct >= 0
                  ? 'text-[#00d9a3]'
                  : 'text-[#ff4d4d]'
                : 'text-zinc-600'
            }`}
          >
            {fmtPct(s.vwapDistPct)}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500">
            {s.meta.fundingRate != null ? 'Funding' : s.meta.oiChangePct != null ? 'OI' : 'ATR'}
          </span>
          <div className="font-num font-semibold text-zinc-300">
            {s.meta.fundingRate != null
              ? fmtPct(s.meta.fundingRate * 100)
              : s.meta.oiChangePct != null
                ? fmtPct(s.meta.oiChangePct)
                : fmtPct(s.atrPct, false)}
          </div>
        </div>
      </div>

      {/* Enlarged Chart (المخطط مكبر في نسخة الجوال) */}
      <div className="mt-2.5 rounded-lg border border-zinc-800/80 bg-[#0a0b0e] p-2">
        <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] text-zinc-500">
          <span className="font-medium text-zinc-400">مخطط الحركة اللحظية (VWAP + السعر)</span>
          <span className="font-num text-[10px]">
            {s.spark.length > 1 && s.spark[s.spark.length - 1] >= s.spark[0] ? (
              <span className="font-semibold text-[#00d9a3]">▲ صاعد</span>
            ) : (
              <span className="font-semibold text-[#ff4d4d]">▼ هابط</span>
            )}
          </span>
        </div>
        <Sparkline
          data={s.spark}
          vwap={s.vwapSpark}
          height={55}
          responsive={true}
          positive={s.spark.length > 1 && s.spark[s.spark.length - 1] >= s.spark[0]}
        />
      </div>

      {/* Parts & Signals Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-zinc-900 pt-2">
        {s.parts
          .filter((p) => p.points > 0)
          .map((p) => (
            <span key={p.key} className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
              {p.label}
            </span>
          ))}
        {s.parts.some((p) => p.points < 0) && (
          <span className="rounded bg-[#ff4d4d]/10 px-1.5 py-0.5 text-[10px] text-[#ff4d4d]">
            {s.parts.find((p) => p.points < 0)?.label}
          </span>
        )}
        {dim && s.filterReasons.length > 0 && (
          <span className="rounded bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-zinc-500">{s.filterReasons[0]}</span>
        )}
      </div>

      {/* Accordion Drawer for Mobile (النافذة المطوية للجوال) */}
      {expanded && items.length > 1 && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-[#0b0c0f] p-2.5 shadow-inner">
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="font-bold text-zinc-200">بقية أسواق {s.meta.base} ({items.length})</span>
            <span className="text-zinc-500 text-[9px]">مرتبة حسب القوة</span>
          </div>
          <div className="space-y-2">
            {items.map((sub, idx) => {
              const isSubFutures = sub.meta.market === 'futures'
              return (
                <div
                  key={`${sub.meta.exchange}:${sub.meta.market}:${sub.meta.symbol}`}
                  className="flex items-center justify-between rounded border border-zinc-800/70 bg-[#14161c] p-2 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-zinc-500 font-bold">#{idx + 1}</span>
                    <ExchangeIcon exchange={sub.meta.exchange} size={14} className="rounded-sm" />
                    <span className="font-bold text-zinc-200 capitalize text-[11px]">{sub.meta.exchange}</span>
                    <CopyButton text={sub.meta.base} size={9} />
                    <span
                      className={`rounded px-1 text-[8px] font-bold border ${
                        isSubFutures
                          ? 'border-purple-500/40 bg-purple-500/20 text-purple-300'
                          : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {isSubFutures ? 'PERP' : 'SPOT'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-num font-semibold text-zinc-100" dir="ltr">
                      {fmtPrice(sub.meta.price)}
                    </span>
                    <span
                      className="font-num text-[11px] font-bold"
                      style={{
                        color: sub.strength === 'strong' ? '#00d9a3' : sub.strength === 'normal' ? '#f5c518' : '#71717a',
                      }}
                    >
                      {sub.score}p
                    </span>
                    <a
                      href={getTradingViewUrl(sub.meta.exchange, sub.meta.symbol, sub.meta.base, sub.meta.market)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-[#3179f5] hover:bg-[#3179f5]/10"
                    >
                      TV
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function SignalCards({
  scans,
  loading,
  onEnter,
  webhookReady,
  onWebhookSend,
  icons = {},
}: {
  scans: SymbolScan[]
  loading: boolean
  onEnter?: (s: SymbolScan) => void
  webhookReady?: boolean
  onWebhookSend?: (symbol: string) => Promise<'ok' | 'err'>
  icons?: Record<string, string>
}) {
  const { sendState, handleSend } = useWebhookSend(onWebhookSend)

  // Group scans by base symbol
  const grouped = useMemo(() => {
    const map = new Map<string, { base: string; primary: SymbolScan; items: SymbolScan[] }>()
    for (const s of scans) {
      const existing = map.get(s.meta.base)
      if (!existing) {
        map.set(s.meta.base, {
          base: s.meta.base,
          primary: s,
          items: [s],
        })
      } else {
        existing.items.push(s)
        if (s.score > existing.primary.score) {
          existing.primary = s
        }
      }
    }
    return Array.from(map.values()).map((g) => {
      g.items.sort((a, b) => b.score - a.score)
      return g
    })
  }, [scans])

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-zinc-900" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-3">
      {grouped.map((g) => (
        <Card
          key={g.base}
          primary={g.primary}
          items={g.items}
          onEnter={onEnter}
          webhookReady={webhookReady}
          sendState={sendState}
          onSend={handleSend}
          icons={icons}
        />
      ))}
    </div>
  )
}
