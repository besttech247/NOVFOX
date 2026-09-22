import { Fragment, useMemo, useState } from 'react'
import type { SymbolScan } from '@/types'
import { fmtClock, fmtPct, fmtPrice, fmtVol } from '@/lib/format'
import { getTradingViewUrl } from '@/lib/tradingview'
import { Sparkline } from './Sparkline'
import { CoinIcon } from '@/components/CoinIcon'
import { ExchangeIcon } from '@/components/ExchangeIcon'
import { CopyButton } from '@/components/CopyButton'
import {
  ArrowDown,
  ArrowUp,
  TrendingUp,
  Flame,
  Zap,
  LogIn,
  Check,
  Loader2,
  Send,
  XCircle,
  ChevronDown,
} from 'lucide-react'

export type SendState = Record<string, 'busy' | 'ok' | 'err' | undefined>

/** manual webhook send button — icon-only so table rows stay one line tall */
export function WebhookSendButton({
  symbol,
  sendState,
  onSend,
}: {
  symbol: string
  sendState: SendState
  onSend: (symbol: string) => void
}) {
  const st = sendState[symbol]
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onSend(symbol)
      }}
      disabled={st === 'busy'}
      title="إرسال إشارة هذه العملة إلى الويب هوك الآن"
      className={`rounded border p-1 transition-colors disabled:opacity-60 ${
        st === 'ok'
          ? 'border-[#00d9a3]/50 text-[#00d9a3]'
          : st === 'err'
            ? 'border-[#ff4d4d]/50 text-[#ff4d4d]'
            : 'border-zinc-700 text-zinc-400 hover:border-[#00d9a3]/50 hover:text-[#00d9a3]'
      }`}
    >
      {st === 'busy' ? (
        <Loader2 size={10} className="animate-spin" />
      ) : st === 'ok' ? (
        <Check size={10} />
      ) : st === 'err' ? (
        <XCircle size={10} />
      ) : (
        <Send size={10} />
      )}
    </button>
  )
}

export function useWebhookSend(onWebhookSend?: (symbol: string) => Promise<'ok' | 'err'>) {
  const [sendState, setSendState] = useState<SendState>({})
  const handleSend = (symbol: string) => {
    if (!onWebhookSend) return
    setSendState((m) => ({ ...m, [symbol]: 'busy' }))
    void onWebhookSend(symbol).then((r) => {
      setSendState((m) => ({ ...m, [symbol]: r }))
      setTimeout(() => {
        setSendState((m) => {
          const c = { ...m }
          delete c[symbol]
          return c
        })
      }, 2500)
    })
  }
  return { sendState, handleSend }
}

// ---------- sorting ----------

export type SortKey = 'score' | 'base' | 'price' | 'change' | 'rsi' | 'funding' | 'oi' | 'relVol' | 'vwap' | 'updated'

export const SORT_KEYS: SortKey[] = ['score', 'base', 'price', 'change', 'rsi', 'funding', 'oi', 'relVol', 'vwap', 'updated']

/** build a comparator for the given column; nulls always sink to the bottom */
export function compareScans(key: SortKey, dir: 1 | -1) {
  const val = (s: SymbolScan): number | string | null => {
    switch (key) {
      case 'score':
        return s.score
      case 'base':
        return s.meta.base
      case 'price':
        return s.meta.price
      case 'change':
        return s.meta.change24h
      case 'rsi':
        return s.rsi
      case 'funding':
        return s.meta.fundingRate ?? null
      case 'oi':
        return s.meta.oiChangePct ?? null
      case 'relVol':
        return s.relVol
      case 'vwap':
        return s.vwapDistPct
      case 'updated':
        return s.updatedAt
    }
  }
  return (a: SymbolScan, b: SymbolScan): number => {
    const va = val(a)
    const vb = val(b)
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir
    return (va - vb) * dir
  }
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: 1 | -1
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === k
  return (
    <th className="px-3 py-2 text-start font-medium">
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 transition-colors hover:text-zinc-300 ${active ? 'text-[#00d9a3]' : ''}`}
      >
        {label}
        {active && (sortDir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </button>
    </th>
  )
}

// ---------- cells ----------

function ScoreBar({ score, strength }: { score: number; strength: SymbolScan['strength'] }) {
  const color = strength === 'strong' ? '#00d9a3' : strength === 'normal' ? '#f5c518' : '#3f3f46'
  return (
    <div className="flex items-center gap-1.5" dir="ltr">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span
        className="font-num text-sm font-semibold tabular-nums"
        style={{ color: strength === 'none' ? '#71717a' : color }}
      >
        {score}
      </span>
    </div>
  )
}

function StrengthBadge({ strength }: { strength: SymbolScan['strength'] }) {
  if (strength === 'strong')
    return (
      <span
        title="إشارة قوية"
        className="inline-flex shrink-0 items-center justify-center rounded border border-[#00d9a3]/40 bg-[#00d9a3]/10 p-1 text-[#00d9a3]"
      >
        <Flame size={12} />
      </span>
    )
  if (strength === 'normal')
    return (
      <span
        title="إشارة عادية"
        className="inline-flex shrink-0 items-center justify-center rounded border border-[#f5c518]/30 bg-[#f5c518]/10 p-1 text-[#f5c518]"
      >
        <Zap size={12} />
      </span>
    )
  return null
}

function Num({ v, className = '' }: { v: string; className?: string }) {
  return (
    <span dir="ltr" className={`font-num tabular-nums ${className}`}>
      {v}
    </span>
  )
}

export function SignalTable({
  scans,
  loading,
  onEnter,
  webhookReady,
  onWebhookSend,
  sortKey,
  sortDir,
  onSort,
  icons = {},
}: {
  scans: SymbolScan[]
  loading: boolean
  onEnter?: (s: SymbolScan) => void
  webhookReady?: boolean
  onWebhookSend?: (symbol: string) => Promise<'ok' | 'err'>
  sortKey: SortKey
  sortDir: 1 | -1
  onSort: (k: SortKey) => void
  icons?: Record<string, string>
}) {
  const { sendState, handleSend } = useWebhookSend(onWebhookSend)
  const [expandedBases, setExpandedBases] = useState<Set<string>>(new Set())

  const toggleExpand = (base: string) => {
    setExpandedBases((prev) => {
      const next = new Set(prev)
      if (next.has(base)) next.delete(base)
      else next.add(base)
      return next
    })
  }

  // Group scans by base symbol: the primary row is the one with the highest score
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

  const showFunding = scans.some((s) => s.meta.fundingRate != null)
  const showOI = scans.some((s) => s.meta.oiChangePct != null)

  if (loading) {
    return (
      <div className="space-y-1.5 p-3">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-zinc-900" style={{ opacity: 1 - i * 0.05 }} />
        ))}
      </div>
    )
  }

  const th = { sortKey, sortDir, onSort }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[940px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-500">
            <SortTh label="العملة" k="base" {...th} />
            <SortTh label="النقاط / الحالة" k="score" {...th} />
            <SortTh label="السعر" k="price" {...th} />
            <th className="px-3 py-2 text-start font-medium min-w-[140px]">المخطط</th>
            <SortTh label="24س" k="change" {...th} />
            <SortTh label="RSI" k="rsi" {...th} />
            <SortTh label="الحجم ×" k="relVol" {...th} />
            <SortTh label="VWAP" k="vwap" {...th} />
            {showFunding && <SortTh label="Funding" k="funding" {...th} />}
            {showOI && <SortTh label="OI ‏15د" k="oi" {...th} />}
            <th className="px-3 py-2 text-start font-medium">مكوّنات</th>
            <SortTh label="التحديث" k="updated" {...th} />
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => {
            const s = g.primary
            const isExpanded = expandedBases.has(g.base)
            const isFutures = s.meta.market === 'futures'
            const dim = !s.passesFilters

            // Market indicator border accent & glow
            const marketAccent = isFutures
              ? 'border-s-[3px] border-s-purple-500/80 hover:bg-purple-950/15'
              : 'border-s-[3px] border-s-emerald-500/80 hover:bg-emerald-950/15'

            const rowGlow =
              s.strength === 'strong'
                ? isFutures
                  ? 'bg-purple-950/20 shadow-[inset_3px_0_0_#a855f7]'
                  : 'bg-emerald-950/20 shadow-[inset_3px_0_0_#10b981]'
                : s.strength === 'normal'
                  ? 'bg-[#f5c518]/[0.03] shadow-[inset_3px_0_0_#f5c51866]'
                  : ''

            return (
              <Fragment key={g.base}>
                {/* Main Primary Row */}
                <tr
                  onClick={() => toggleExpand(g.base)}
                  className={`border-b border-zinc-900/80 transition-colors cursor-pointer ${marketAccent} ${rowGlow} ${
                    dim ? 'opacity-40' : ''
                  }`}
                >
                  {/* العملة + أيقونة المنصة فقط + لون السوق */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <CoinIcon base={s.meta.base} icons={icons} size={20} />
                      <div className="flex flex-col leading-tight">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-zinc-100">{s.meta.base}</span>
                          <CopyButton text={s.meta.base} size={10} />

                          {/* Exchange Icon Only (No Text) */}
                          <ExchangeIcon
                            exchange={s.meta.exchange}
                            size={14}
                            className="rounded-sm"
                          />

                          {/* Market Badge (Color Indicator) */}
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

                          {/* Expand Counter Button */}
                          {g.items.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleExpand(g.base)
                              }}
                              title={isExpanded ? 'طي الخيارات' : 'عرض باقي المنصات والأسواق'}
                              className="ms-1 inline-flex items-center gap-0.5 rounded bg-zinc-800/80 px-1 py-0.5 text-[9px] font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                            >
                              <span>+{g.items.length - 1}</span>
                              <ChevronDown
                                size={10}
                                className={`transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180 text-[#00d9a3]' : ''
                                }`}
                              />
                            </button>
                          )}
                        </div>
                        <Num v={fmtVol(s.meta.quoteVol24h)} className="text-[10px] text-zinc-600" />
                      </div>
                    </div>
                  </td>

                  {/* النقاط + الحالة + الأزرار (أيقونات فقط بدون نص) */}
                  <td className="px-3 py-1.5">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <StrengthBadge strength={s.strength} />
                        <ScoreBar score={s.score} strength={s.strength} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {onEnter && s.strength !== 'none' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onEnter(s)
                            }}
                            title="تسجيل دخول الصفقة في اليومية"
                            className="inline-flex items-center justify-center rounded border border-zinc-700 p-1 text-zinc-400 transition-colors hover:border-[#00d9a3]/50 hover:text-[#00d9a3]"
                          >
                            <LogIn size={11} />
                          </button>
                        )}
                        {webhookReady && onWebhookSend && (
                          <WebhookSendButton symbol={`${s.meta.base.toUpperCase()}USDT`} sendState={sendState} onSend={handleSend} />
                        )}
                        <a
                          href={getTradingViewUrl(s.meta.exchange, s.meta.symbol, s.meta.base, s.meta.market)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="فتح في TradingView"
                          className="inline-flex items-center justify-center rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-[#3179f5] transition-colors hover:border-[#3179f5]/50 hover:bg-[#3179f5]/10"
                        >
                          TV
                        </a>
                      </div>
                    </div>
                  </td>

                  {/* السعر ونسبة التغير من سعر الافتتاح اليومي */}
                  <td className="px-3 py-1.5">
                    <div className="flex flex-col leading-tight">
                      <Num v={fmtPrice(s.meta.price)} className="font-semibold text-zinc-100" />
                      {(() => {
                        const dailyPct = s.meta.changeDaily ?? s.meta.change24h
                        return (
                          <span
                            dir="ltr"
                            title={
                              s.meta.openDaily != null
                                ? `افتتاح اليوم (00:00 UTC): ${fmtPrice(s.meta.openDaily)}`
                                : 'نسبة التغير من الافتتاح اليومي'
                            }
                            className={`font-num text-[10px] font-medium tabular-nums ${
                              dailyPct == null
                                ? 'text-zinc-500'
                                : dailyPct >= 0
                                  ? 'text-[#00d9a3]'
                                  : 'text-[#ff4d4d]'
                            }`}
                          >
                            {fmtPct(dailyPct)}
                          </span>
                        )
                      })()}
                    </div>
                  </td>

                  {/* المخطط (Sparkline) - العمود الرابع مكبر */}
                  <td className="px-3 py-1.5 min-w-[140px]">
                    <Sparkline
                      data={s.spark}
                      vwap={s.vwapSpark}
                      width={130}
                      height={30}
                      positive={s.spark.length > 1 && s.spark[s.spark.length - 1] >= s.spark[0]}
                    />
                  </td>

                  {/* 24س */}
                  <td className="px-3 py-1.5">
                    <Num
                      v={fmtPct(s.meta.change24h)}
                      className={s.meta.change24h >= 0 ? 'text-[#00d9a3]' : 'text-[#ff4d4d]'}
                    />
                  </td>

                  {/* RSI */}
                  <td className="px-3 py-1.5">
                    <Num
                      v={s.rsi != null ? s.rsi.toFixed(1) : '—'}
                      className={
                        s.rsi != null
                          ? s.rsi >= 70
                            ? 'font-semibold text-[#ff4d4d]'
                            : s.rsi <= 30
                              ? 'font-semibold text-[#00d9a3]'
                              : 'text-zinc-300'
                          : 'text-zinc-600'
                      }
                    />
                  </td>

                  {/* الحجم × */}
                  <td className="px-3 py-1.5">
                    <Num
                      v={s.relVol != null ? `${s.relVol.toFixed(1)}×` : '—'}
                      className={
                        s.relVol != null && s.relVol >= 2
                          ? 'font-semibold text-[#f5c518]'
                          : s.relVol != null && s.relVol >= 1.2
                            ? 'text-zinc-200'
                            : 'text-zinc-500'
                      }
                    />
                  </td>

                  {/* VWAP */}
                  <td className="px-3 py-1.5">
                    <Num
                      v={fmtPct(s.vwapDistPct)}
                      className={
                        s.vwapDistPct != null
                          ? s.vwapDistPct >= 0
                            ? 'text-[#00d9a3]'
                            : 'text-[#ff4d4d]'
                          : 'text-zinc-600'
                      }
                    />
                  </td>

                  {/* Funding */}
                  {showFunding && (
                    <td className="px-3 py-1.5">
                      <Num
                        v={fmtPct(s.meta.fundingRate != null ? s.meta.fundingRate * 100 : null)}
                        className={
                          s.meta.fundingRate != null
                            ? s.meta.fundingRate < 0
                              ? 'text-[#00d9a3]'
                              : s.meta.fundingRate > 0.0003
                                ? 'text-[#ff4d4d]'
                                : 'text-zinc-400'
                            : 'text-zinc-600'
                        }
                      />
                    </td>
                  )}

                  {/* OI */}
                  {showOI && (
                    <td className="px-3 py-1.5">
                      <Num
                        v={fmtPct(s.meta.oiChangePct)}
                        className={
                          s.meta.oiChangePct != null
                            ? s.meta.oiChangePct > 0
                              ? 'text-[#00d9a3]'
                              : s.meta.oiChangePct < 0
                                ? 'text-[#ff4d4d]'
                                : 'text-zinc-400'
                            : 'text-zinc-600'
                        }
                      />
                    </td>
                  )}

                  {/* مكوّنات الإشارة */}
                  <td className="max-w-[190px] px-3 py-1.5">
                    <div className="flex flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap">
                      {s.parts
                        .filter((p) => p.points > 0)
                        .slice(0, 2)
                        .map((p) => (
                          <span
                            key={p.key}
                            className="shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300"
                          >
                            {p.label}
                          </span>
                        ))}
                      {s.parts.some((p) => p.points < 0) && (
                        <span className="shrink-0 rounded bg-[#ff4d4d]/10 px-1.5 py-0.5 text-[10px] text-[#ff4d4d]">
                          {s.parts.find((p) => p.points < 0)?.label}
                        </span>
                      )}
                      {dim && s.filterReasons.length > 0 && (
                        <span className="shrink-0 rounded bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {s.filterReasons[0]}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* التحديث */}
                  <td className="px-3 py-1.5">
                    <Num v={fmtClock(s.updatedAt)} className="text-[11px] text-zinc-500" />
                  </td>
                </tr>

                {/* Collapsible Accordion Drawer (النافذة المطوية) */}
                {isExpanded && (
                  <tr className="border-b border-zinc-800 bg-[#090a0d]">
                    <td colSpan={12} className="px-4 py-3">
                      <div className="rounded-lg border border-zinc-800/90 bg-[#101216] p-3 shadow-inner">
                        <div className="mb-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-200">
                              جميع أسواق ومنصات {g.base} ({g.items.length})
                            </span>
                            <CopyButton text={g.base} size={11} />
                            <span className="text-[10px] text-zinc-500">
                              مرتبة تنازلياً حسب قوة الإشارة
                            </span>
                          </div>
                          <button
                            onClick={() => toggleExpand(g.base)}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            إغلاق النافذة المطوية ✕
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {g.items.map((sub, idx) => {
                            const isSubFutures = sub.meta.market === 'futures'
                            const isTop = idx === 0
                            return (
                              <div
                                key={`${sub.meta.exchange}:${sub.meta.market}:${sub.meta.symbol}`}
                                className={`flex flex-col gap-2 rounded-lg border p-2.5 transition-all ${
                                  isTop
                                    ? 'border-[#00d9a3]/40 bg-[#00d9a3]/[0.04] shadow-[0_0_12px_rgba(0,217,163,0.06)]'
                                    : 'border-zinc-800/80 bg-[#15181e] hover:border-zinc-700'
                                }`}
                              >
                                {/* Top Header: Rank + Exchange + Market + Score */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-zinc-500">#{idx + 1}</span>
                                    <ExchangeIcon exchange={sub.meta.exchange} size={16} className="rounded-sm" />
                                    <span className="text-xs font-bold text-zinc-200 capitalize">
                                      {sub.meta.exchange}
                                    </span>
                                    <span
                                      className={`rounded px-1 py-0.2 text-[8px] font-bold border ${
                                        isSubFutures
                                          ? 'border-purple-500/40 bg-purple-500/20 text-purple-300'
                                          : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                                      }`}
                                    >
                                      {isSubFutures ? 'PERP' : 'SPOT'}
                                    </span>
                                  </div>
                                  <span
                                    className="font-num text-xs font-bold tabular-nums"
                                    style={{
                                      color:
                                        sub.strength === 'strong'
                                          ? '#00d9a3'
                                          : sub.strength === 'normal'
                                            ? '#f5c518'
                                            : '#71717a',
                                    }}
                                  >
                                    {sub.score} pts
                                  </span>
                                </div>

                                {/* Price, Change, and Technicals */}
                                <div className="grid grid-cols-3 gap-1 rounded bg-zinc-900/60 p-1.5 text-center text-[10px]">
                                  <div>
                                    <span className="block text-[8px] text-zinc-500">السعر اللحظي</span>
                                    <span className="font-num font-semibold text-zinc-100" dir="ltr">
                                      {fmtPrice(sub.meta.price)}
                                    </span>
                                    {(() => {
                                      const subDailyPct = sub.meta.changeDaily ?? sub.meta.change24h
                                      return (
                                        <span
                                          className={`block font-num text-[9px] font-medium tabular-nums ${
                                            subDailyPct == null
                                              ? 'text-zinc-500'
                                              : subDailyPct >= 0
                                                ? 'text-[#00d9a3]'
                                                : 'text-[#ff4d4d]'
                                          }`}
                                          dir="ltr"
                                          title={
                                            sub.meta.openDaily != null
                                              ? `افتتاح اليوم (00:00 UTC): ${fmtPrice(sub.meta.openDaily)}`
                                              : 'نسبة التغير من الافتتاح اليومي'
                                          }
                                        >
                                          {fmtPct(subDailyPct)}
                                        </span>
                                      )
                                    })()}
                                  </div>
                                  <div>
                                    <span className="block text-[8px] text-zinc-500">التغير 24س</span>
                                    <span
                                      className={`font-num font-semibold ${
                                        sub.meta.change24h >= 0 ? 'text-[#00d9a3]' : 'text-[#ff4d4d]'
                                      }`}
                                    >
                                      {fmtPct(sub.meta.change24h)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[8px] text-zinc-500">RSI / Vol</span>
                                    <span className="font-num text-zinc-300">
                                      {sub.rsi?.toFixed(0) ?? '—'} / {sub.relVol ? `${sub.relVol.toFixed(1)}×` : '—'}
                                    </span>
                                  </div>
                                </div>

                                {/* Futures Metrics (if present) */}
                                {(sub.meta.fundingRate != null || sub.meta.oiChangePct != null) && (
                                  <div className="flex items-center justify-between text-[9px] px-1 text-zinc-400">
                                    {sub.meta.fundingRate != null && (
                                      <span>
                                        Funding:{' '}
                                        <span className="font-num text-zinc-200">
                                          {sub.meta.fundingRate >= 0 ? '+' : ''}
                                          {(sub.meta.fundingRate * 100).toFixed(4)}%
                                        </span>
                                      </span>
                                    )}
                                    {sub.meta.oiChangePct != null && (
                                      <span>
                                        OI 15د:{' '}
                                        <span
                                          className={`font-num font-semibold ${
                                            sub.meta.oiChangePct >= 0 ? 'text-[#00d9a3]' : 'text-[#ff4d4d]'
                                          }`}
                                        >
                                          {sub.meta.oiChangePct >= 0 ? '+' : ''}
                                          {sub.meta.oiChangePct.toFixed(2)}%
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Signal Parts & Action Buttons */}
                                <div className="mt-0.5 flex items-center justify-between border-t border-zinc-800/70 pt-1.5">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {sub.parts
                                      .filter((p) => p.points > 0)
                                      .slice(0, 2)
                                      .map((p) => (
                                        <span
                                          key={p.key}
                                          className="rounded bg-zinc-800 px-1 py-0.5 text-[8px] text-zinc-400"
                                        >
                                          {p.label}
                                        </span>
                                      ))}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {onEnter && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          onEnter(sub)
                                        }}
                                        title="تسجيل في اليومية"
                                        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-[#00d9a3]/50 hover:text-[#00d9a3]"
                                      >
                                        دخول
                                      </button>
                                    )}
                                    <a
                                      href={getTradingViewUrl(
                                        sub.meta.exchange,
                                        sub.meta.symbol,
                                        sub.meta.base,
                                        sub.meta.market
                                      )}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded border border-zinc-700 px-2 py-0.5 text-[9px] font-bold text-[#3179f5] hover:bg-[#3179f5]/10"
                                    >
                                      TV
                                    </a>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
