/**
 * Archive view (Phase 2): signals persisted in PostgreSQL (3-day retention).
 * Per-symbol stats for the last hour / 24h + a sortable, filterable history table.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { ArchivedSignal, SymbolStats } from '@/lib/serverTypes'
import { fmtAgo, fmtClock, fmtPrice } from '@/lib/format'
import { CoinIcon } from '@/components/CoinIcon'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Database,
  Flame,
  History as HistoryIcon,
  Loader2,
  RefreshCcw,
  Search,
  Zap,
} from 'lucide-react'

type SortKey = 'time' | 'base' | 'score' | 'price' | 'rsi' | 'relVol' | 'strength' | 'timeframe'
type SortDir = 'asc' | 'desc'

const RANGE_OPTIONS = [
  { hours: 1, label: 'ساعة' },
  { hours: 6, label: '6 ساعات' },
  { hours: 24, label: '24 ساعة' },
  { hours: 72, label: '3 أيام' },
] as const

function StrengthBadge({ strength }: { strength: ArchivedSignal['strength'] }) {
  if (strength === 'strong')
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[#00d9a3]/40 bg-[#00d9a3]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#00d9a3]">
        <Flame size={11} /> قوية
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[#f5c518]/30 bg-[#f5c518]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#f5c518]">
      <Zap size={11} /> عادية
    </span>
  )
}

function Num({ v, className = '' }: { v: string; className?: string }) {
  return (
    <span dir="ltr" className={`font-num tabular-nums ${className}`}>
      {v}
    </span>
  )
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sortKey === k
  return (
    <th className={`px-3 py-2.5 text-start font-medium ${className}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-[#00d9a3]' : 'hover:text-zinc-300'}`}
      >
        {label}
        {active ? (
          sortDir === 'desc' ? (
            <ArrowDown size={11} />
          ) : (
            <ArrowUp size={11} />
          )
        ) : (
          <ArrowUpDown size={11} className="opacity-40" />
        )}
      </button>
    </th>
  )
}

function StatsCard({
  s,
  active,
  now,
  onPick,
  icons,
}: {
  s: SymbolStats
  active: boolean
  now: number
  onPick: (base: string) => void
  icons: Record<string, string>
}) {
  return (
    <button
      onClick={() => onPick(s.base)}
      title={active ? 'إلغاء التصفية' : `عرض إشارات ${s.base} فقط`}
      className={`shrink-0 rounded-lg border px-3 py-2 text-start transition-colors ${
        active
          ? 'border-[#00d9a3]/50 bg-[#00d9a3]/[0.08]'
          : 'border-zinc-800 bg-[#121214] hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-2">
        <CoinIcon base={s.base} icons={icons} size={16} />
        <span className="text-sm font-bold text-zinc-100">{s.base}</span>
        {s.lastAt && (
          <span className="text-[10px] text-zinc-500">{fmtAgo(new Date(s.lastAt).getTime(), now)}</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[10px]">
        <span className="text-zinc-500">
          آخر ساعة:{' '}
          {s.strong1h > 0 && (
            <span className="font-semibold text-[#00d9a3]">
              <Num v={String(s.strong1h)} /> <Flame size={9} className="inline" />
            </span>
          )}{' '}
          {s.normal1h > 0 && (
            <span className="font-semibold text-[#f5c518]">
              <Num v={String(s.normal1h)} /> <Zap size={9} className="inline" />
            </span>
          )}
          {s.strong1h === 0 && s.normal1h === 0 && <span className="text-zinc-600">—</span>}
        </span>
        <span className="text-zinc-500">
          آخر يوم:{' '}
          {s.strong24h > 0 && <span className="font-semibold text-[#00d9a3]"><Num v={String(s.strong24h)} /> قوية</span>}{' '}
          {s.normal24h > 0 && <span className="font-semibold text-[#f5c518]"><Num v={String(s.normal24h)} /> عادية</span>}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
        <span>
          الإجمالي <Num v={String(s.total24h)} className="font-semibold text-zinc-300" />
        </span>
        <span>
          أعلى نقاط <Num v={String(s.bestScore24h)} className="font-semibold text-zinc-300" />
        </span>
      </div>
    </button>
  )
}

export function HistoryView({ icons = {} }: { icons?: Record<string, string> }) {
  const [rows, setRows] = useState<ArchivedSignal[]>([])
  const [stats, setStats] = useState<SymbolStats[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [dbOff, setDbOff] = useState(false)
  const [hours, setHours] = useState<number>(24)
  const [strength, setStrength] = useState<'' | 'strong' | 'normal'>('')
  const [tf, setTf] = useState<'' | '1m' | '3m' | '5m'>('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [now, setNow] = useState(Date.now())

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const [sigRes, statsRes] = await Promise.all([
          api.historySignals({
            hours,
            strength: strength || undefined,
            timeframe: tf || undefined,
            limit: 500,
          }),
          api.historyStats(),
        ])
        setRows(sigRes.signals)
        setStats(statsRes.stats)
        setDbOff(!sigRes.dbAvailable || !statsRes.dbAvailable)
        setFailed(false)
        setNow(Date.now())
      } catch {
        setFailed(true)
      } finally {
        setLoading(false)
      }
    },
    [hours, strength, tf],
  )

  useEffect(() => {
    void load()
  }, [load])

  // silent auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(() => void load(true), 60_000)
    return () => clearInterval(t)
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    const list = q ? rows.filter((r) => r.base.includes(q) || r.symbol.includes(q)) : rows
    const dir = sortDir === 'desc' ? -1 : 1
    const strengthRank = (s: ArchivedSignal['strength']) => (s === 'strong' ? 2 : 1)
    const val = (r: ArchivedSignal): number | string => {
      switch (sortKey) {
        case 'time':
          return new Date(r.createdAt).getTime()
        case 'base':
          return r.base
        case 'score':
          return r.score
        case 'price':
          return r.price
        case 'rsi':
          return r.rsi ?? -1
        case 'relVol':
          return r.relVol ?? -1
        case 'strength':
          return strengthRank(r.strength)
        case 'timeframe':
          return r.timeframe
      }
    }
    return [...list].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir
      return (va - vb) * dir
    })
  }, [rows, query, sortKey, sortDir])

  const onSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'base' ? 'asc' : 'desc')
    }
  }

  const pickBase = (base: string) => {
    setQuery((q) => (q.trim().toUpperCase() === base ? '' : base))
  }

  const showFunding = filtered.some((r) => r.fundingRate != null)
  const showOI = filtered.some((r) => r.oiChangePct != null)

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-3 sm:px-4">
      {dbOff && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#f5c518]/30 bg-[#f5c518]/[0.07] px-3 py-2 text-xs text-[#f5c518]">
          <Database size={14} />
          قاعدة البيانات غير متصلة — الأرشيف يحتاج PostgreSQL (DATABASE_URL) ليعمل. الإشارات الحالية تُعرض في صفحة
          المسح الحي فقط.
        </div>
      )}

      {/* ===== per-symbol stats ===== */}
      <section className="mb-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <HistoryIcon size={13} className="text-[#00d9a3]" />
          إحصائيات الرموز — آخر ساعة / آخر 24 ساعة
          <span className="text-[10px] font-normal text-zinc-600">(اضغط على رمز لتصفية الجدول)</span>
        </div>
        {stats.length === 0 ? (
          <p className="rounded-lg border border-zinc-800/80 bg-[#121214] px-3 py-3 text-xs text-zinc-500">
            {loading ? 'جارٍ التحميل…' : 'لا توجد إشارات مؤرشفة خلال آخر 24 ساعة بعد — تظهر هنا فور بدء السكانر بحفظ الإشارات.'}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stats.map((s) => (
              <StatsCard key={s.base} s={s} active={query.trim().toUpperCase() === s.base} now={now} onPick={pickBase} icons={icons} />
            ))}
          </div>
        )}
      </section>

      {/* ===== filters ===== */}
      <section className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex overflow-hidden rounded-md border border-zinc-800" aria-label="الفترة">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                hours === r.hours ? 'bg-[#00d9a3] text-black' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </nav>

        <nav className="flex overflow-hidden rounded-md border border-zinc-800" aria-label="القوة">
          {(
            [
              { id: '', label: 'الكل' },
              { id: 'strong', label: 'قوية' },
              { id: 'normal', label: 'عادية' },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              onClick={() => setStrength(o.id)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                strength === o.id
                  ? o.id === 'strong'
                    ? 'bg-[#00d9a3]/15 text-[#00d9a3] shadow-[inset_0_0_0_1px_rgba(0,217,163,0.4)]'
                    : o.id === 'normal'
                      ? 'bg-[#f5c518]/15 text-[#f5c518] shadow-[inset_0_0_0_1px_rgba(245,197,24,0.4)]'
                      : 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </nav>

        <nav className="flex overflow-hidden rounded-md border border-zinc-800" aria-label="الفريم">
          {(
            [
              { id: '', label: 'كل الفريمات' },
              { id: '1m', label: '1m' },
              { id: '3m', label: '3m' },
              { id: '5m', label: '5m' },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              onClick={() => setTf(o.id)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                tf === o.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </nav>

        <div className="relative min-w-[140px] flex-1 sm:max-w-[220px]">
          <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالرمز…"
            className="w-full rounded-md border border-zinc-800 bg-[#121214] py-1.5 pe-3 ps-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#00d9a3]/50 focus:outline-none"
          />
        </div>

        <button
          onClick={() => void load()}
          title="تحديث"
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-[#00d9a3]/40 hover:text-[#00d9a3]"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
          <span className="hidden sm:inline">تحديث</span>
        </button>

        <span className="ms-auto hidden text-[10px] text-zinc-600 sm:inline">
          {filtered.length} إشارة · آخر تحديث {fmtClock(now)} · الاحتفاظ 3 أيام
        </span>
      </section>

      {/* ===== signals table ===== */}
      {loading && rows.length === 0 ? (
        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-zinc-900" style={{ opacity: 1 - i * 0.07 }} />
          ))}
        </div>
      ) : failed ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-800/80 bg-[#121214] px-4 py-12 text-center">
          <p className="text-sm text-[#ff4d4d]">تعذّر جلب الأرشيف من السيرفر</p>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCcw size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-800/80 bg-[#121214] px-4 py-12 text-center">
          <p className="text-sm text-zinc-400">لا توجد إشارات مطابقة في هذه الفترة</p>
          <p className="mt-1 text-xs text-zinc-600">جرّب توسيع الفترة الزمنية أو إزالة التصفية</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800/60">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-[#121214] text-[11px] text-zinc-500">
                <SortTh label="الوقت" k="time" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="العملة" k="base" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="الفريم" k="timeframe" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="القوة" k="strength" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="النقاط" k="score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="السعر" k="price" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="RSI" k="rsi" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="الحجم ×" k="relVol" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                {showFunding && <th className="px-3 py-2.5 text-start font-medium">Funding</th>}
                {showOI && <th className="px-3 py-2.5 text-start font-medium">OI</th>}
                <th className="px-3 py-2.5 text-start font-medium">مكوّنات الإشارة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const t = new Date(r.createdAt).getTime()
                const rowGlow =
                  r.strength === 'strong'
                    ? 'bg-[#00d9a3]/[0.045] shadow-[inset_3px_0_0_#00d9a3]'
                    : 'bg-[#f5c518]/[0.03] shadow-[inset_3px_0_0_#f5c51866]'
                return (
                  <tr key={r.id} className={`border-b border-zinc-900/80 transition-colors hover:bg-zinc-900/60 ${rowGlow}`}>
                    <td className="px-3 py-2">
                      <Num v={fmtClock(t)} className="text-zinc-300" />
                      <div className="text-[10px] text-zinc-600">{fmtAgo(t, now)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <CoinIcon base={r.base} icons={icons} size={16} />
                        <span className="font-semibold text-zinc-100">{r.base}</span>
                        <span className="text-[10px] text-zinc-500">USDT</span>
                      </div>
                      <div className="text-[10px] capitalize text-zinc-600">
                        {r.exchange} · {r.market === 'futures' ? 'فيوتشر' : 'سبوت'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Num v={r.timeframe} className="text-zinc-300" />
                    </td>
                    <td className="px-3 py-2">
                      <StrengthBadge strength={r.strength} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2" dir="ltr">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${r.score}%`,
                              background: r.strength === 'strong' ? '#00d9a3' : '#f5c518',
                            }}
                          />
                        </div>
                        <Num
                          v={String(r.score)}
                          className={`text-sm font-semibold ${r.strength === 'strong' ? 'text-[#00d9a3]' : 'text-[#f5c518]'}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Num v={fmtPrice(r.price)} className="text-zinc-100" />
                    </td>
                    <td className="px-3 py-2">
                      <Num
                        v={r.rsi === null ? '—' : r.rsi.toFixed(0)}
                        className={
                          r.rsi === null ? 'text-zinc-600' : r.rsi > 80 ? 'text-[#ff4d4d]' : r.rsi < 35 ? 'text-[#f5c518]' : 'text-zinc-300'
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Num
                        v={r.relVol === null ? '—' : `×${r.relVol.toFixed(1)}`}
                        className={r.relVol !== null && r.relVol >= 2 ? 'font-semibold text-[#00d9a3]' : 'text-zinc-300'}
                      />
                    </td>
                    {showFunding && (
                      <td className="px-3 py-2">
                        {r.fundingRate != null ? (
                          <Num
                            v={`${r.fundingRate >= 0 ? '+' : ''}${r.fundingRate.toFixed(3)}%`}
                            className={
                              r.fundingRate >= 0.05 ? 'text-[#f5c518]' : r.fundingRate <= -0.05 ? 'text-[#00d9a3]' : 'text-zinc-400'
                            }
                          />
                        ) : (
                          <Num v="—" className="text-zinc-600" />
                        )}
                      </td>
                    )}
                    {showOI && (
                      <td className="px-3 py-2">
                        {r.oiChangePct != null ? (
                          <Num
                            v={`${r.oiChangePct >= 0 ? '+' : ''}${r.oiChangePct.toFixed(1)}%`}
                            className={r.oiChangePct >= 1 ? 'text-[#00d9a3]' : r.oiChangePct <= -2 ? 'text-[#ff4d4d]' : 'text-zinc-400'}
                          />
                        ) : (
                          <Num v="—" className="text-zinc-600" />
                        )}
                      </td>
                    )}
                    <td className="max-w-[240px] px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.parts.slice(0, 4).map((p) => (
                          <span key={p} className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
                            {p}
                          </span>
                        ))}
                        {r.parts.length > 4 && (
                          <span className="rounded bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-zinc-500">
                            +{r.parts.length - 4}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
