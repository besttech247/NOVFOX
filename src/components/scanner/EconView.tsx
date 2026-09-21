/**
 * Economic filter page: macro calendar (ForexFactory weekly feed) + crypto
 * news headlines, both fetched and cached by the server. Times are shown in
 * the user's local timezone — the server converts from US Eastern.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { EconEvent, NewsItem } from '@/lib/serverTypes'
import { AlertTriangle, CalendarClock, ExternalLink, Newspaper, RefreshCcw } from 'lucide-react'

interface CalResp {
  ok: boolean
  updatedAt: number
  events: EconEvent[]
}
interface NewsResp {
  ok: boolean
  updatedAt: number
  items: NewsItem[]
}

/** Arabic names for the events that move crypto — longest key wins */
const TITLE_AR: [string, string][] = [
  ['FOMC Press Conference', 'المؤتمر الصحفي للفيدرالي'],
  ['FOMC Meeting Minutes', 'محضر اجتماع الفيدرالي'],
  ['FOMC Statement', 'بيان الفائدة الفيدرالية'],
  ['Federal Funds Rate', 'قرار الفائدة الفيدرالية'],
  ['Fed Chair Powell Speaks', 'خطاب رئيس الفيدرالي باول'],
  ['Powell Speaks', 'خطاب باول'],
  ['Non-Farm Employment Change', 'الوظائف غير الزراعية (NFP)'],
  ['ADP Non-Farm Employment Change', 'وظائف القطاع الخاص (ADP)'],
  ['Unemployment Rate', 'معدل البطالة'],
  ['Average Hourly Earnings', 'متوسط الأجور بالساعة'],
  ['Initial Jobless Claims', 'طلبات إعانة البطالة'],
  ['Core PCE Price Index', 'التضخم الأساسي (PCE)'],
  ['Core CPI', 'التضخم الأساسي (CPI)'],
  ['CPI m/m', 'التضخم (CPI) الشهري'],
  ['CPI y/y', 'التضخم (CPI) السنوي'],
  ['Core PPI', 'أسعار المنتجين الأساسية (PPI)'],
  ['PPI m/m', 'أسعار المنتجين (PPI)'],
  ['Core Retail Sales', 'مبيعات التجزئة الأساسية'],
  ['Retail Sales', 'مبيعات التجزئة'],
  ['Advance GDP', 'الناتج المحلي الإجمالي (GDP)'],
  ['Prelim GDP', 'الناتج المحلي الإجمالي (GDP)'],
  ['ISM Manufacturing PMI', 'مديري المشتريات الصناعي (ISM)'],
  ['ISM Services PMI', 'مديري المشتريات للخدمات (ISM)'],
  ['Flash Manufacturing PMI', 'مديري المشتريات الصناعي الأولي'],
  ['Flash Services PMI', 'مديري المشتريات للخدمات الأولي'],
  ['JOLTS Job Openings', 'فرص العمل (JOLTS)'],
  ['CB Consumer Confidence', 'ثقة المستهلك'],
  ['Prelim UoM Consumer Sentiment', 'ثقة المستهلك (ميشيغان)'],
  ['Core Durable Goods', 'السلع المعمرة الأساسية'],
  ['Crude Oil Inventories', 'مخزونات النفط الخام'],
  ['Empire State Manufacturing Index', 'مؤشر نيويورك الصناعي'],
  ['Trade Balance', 'الميزان التجاري'],
  ['Existing Home Sales', 'مبيعات المنازل القائمة'],
  ['New Home Sales', 'مبيعات المنازل الجديدة'],
  ['Building Permits', 'تصاريح البناء'],
]
TITLE_AR.sort((a, b) => b[0].length - a[0].length)

function translateTitle(title: string): string | null {
  for (const [en, ar] of TITLE_AR) {
    if (title.includes(en)) return ar
  }
  return null
}

const IMPACT_STYLE: Record<EconEvent['impact'], { label: string; cls: string }> = {
  high: { label: 'عالية', cls: 'border-[#ff4d4d]/40 bg-[#ff4d4d]/10 text-[#ff4d4d]' },
  medium: { label: 'متوسطة', cls: 'border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]' },
  low: { label: 'منخفضة', cls: 'border-zinc-700 bg-zinc-800/40 text-zinc-500' },
  holiday: { label: 'عطلة', cls: 'border-zinc-700 bg-zinc-800/40 text-zinc-400' },
}

function fmtHM(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtCountdown(ms: number): string {
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `بعد ${mins} د`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `بعد ${h} س` : `بعد ${h} س ${m} د`
}

function fmtAgoShort(at: number, now: number): string {
  const mins = Math.max(0, Math.round((now - at) / 60_000))
  if (mins < 1) return 'الآن'
  if (mins < 60) return `قبل ${mins} د`
  const h = Math.floor(mins / 60)
  if (h < 24) return `قبل ${h} س`
  return `قبل ${Math.floor(h / 24)} يوم`
}

function EventRow({ e, now }: { e: EconEvent; now: number }) {
  const past = e.at <= now
  const soon = !past && e.at - now < 2 * 3_600_000
  const ar = translateTitle(e.title)
  const imp = IMPACT_STYLE[e.impact]
  return (
    <div
      className={`flex items-start gap-3 border-b border-zinc-900/80 px-3 py-2.5 ${
        past ? 'opacity-45' : soon && e.impact === 'high' ? 'bg-[#ff4d4d]/[0.04]' : ''
      }`}
    >
      {/* time column */}
      <div className="w-14 shrink-0 pt-0.5 text-center">
        {e.allDay ? (
          <span className="text-[10px] text-zinc-500">طوال اليوم</span>
        ) : (
          <span className="font-num text-xs font-semibold text-zinc-200 tabular-nums" dir="ltr">
            {fmtHM(e.at)}
          </span>
        )}
        {!past && (
          <div
            className={`mt-0.5 text-[9px] font-semibold ${e.impact === 'high' ? 'text-[#ff4d4d]' : 'text-zinc-500'}`}
          >
            {fmtCountdown(e.at - now)}
          </div>
        )}
        {past && <div className="mt-0.5 text-[9px] text-zinc-600">انتهى</div>}
      </div>

      {/* body */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded border px-1.5 py-0.5 font-num text-[10px] font-bold ${
              e.currency === 'USD' ? 'border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]' : 'border-zinc-700 text-zinc-400'
            }`}
            dir="ltr"
          >
            {e.currency}
          </span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${imp.cls}`}>{imp.label}</span>
        </div>
        <p className="mt-1 text-xs font-semibold leading-relaxed text-zinc-100">{ar ?? e.title}</p>
        {ar && (
          <p className="mt-0.5 truncate text-[10px] text-zinc-500" dir="ltr">
            {e.title}
          </p>
        )}
        {(e.forecast || e.previous) && (
          <p className="mt-1 text-[10px] text-zinc-500">
            {e.forecast && (
              <>
                التوقع{' '}
                <span className="font-num text-zinc-300" dir="ltr">
                  {e.forecast}
                </span>
              </>
            )}
            {e.forecast && e.previous && <span className="mx-1.5 text-zinc-700">·</span>}
            {e.previous && (
              <>
                السابق{' '}
                <span className="font-num text-zinc-300" dir="ltr">
                  {e.previous}
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

export function EconView() {
  const [tab, setTab] = useState<'cal' | 'news'>('cal')
  const [cal, setCal] = useState<CalResp | null>(null)
  const [news, setNews] = useState<NewsResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [highOnly, setHighOnly] = useState(false)
  const [usdOnly, setUsdOnly] = useState(true)

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [c, n] = await Promise.all([api.econCalendar(), api.econNews()])
      setCal(c)
      setNews(n)
      setErr(!c.ok && !n.ok)
    } catch {
      setErr(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
    const refresh = setInterval(() => void load(true), 120_000)
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [load])

  const nextHigh = useMemo(() => {
    if (!cal) return null
    return cal.events.find((e) => e.impact === 'high' && e.at > now) ?? null
  }, [cal, now])

  const groups = useMemo(() => {
    if (!cal) return [] as { key: string; label: string; events: EconEvent[] }[]
    const filtered = cal.events.filter(
      (e) => (!highOnly || e.impact === 'high') && (!usdOnly || e.currency === 'USD')
    )
    const byDay = new Map<string, EconEvent[]>()
    for (const e of filtered) {
      const k = new Date(e.at).toDateString()
      const arr = byDay.get(k)
      if (arr) arr.push(e)
      else byDay.set(k, [e])
    }
    const today = new Date(now).toDateString()
    const tomorrow = new Date(now + 86_400_000).toDateString()
    const dayFmt = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' })
    return [...byDay.entries()].map(([key, events]) => ({
      key,
      label: key === today ? 'اليوم' : key === tomorrow ? 'غداً' : dayFmt.format(new Date(key)),
      events,
    }))
  }, [cal, highOnly, usdOnly, now])

  const updatedAt = Math.max(cal?.updatedAt ?? 0, news?.updatedAt ?? 0)

  return (
    <main className="mx-auto w-full max-w-[900px] flex-1 px-3 py-3 sm:px-4">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-md border border-zinc-800">
          <button
            onClick={() => setTab('cal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'cal' ? 'bg-[#00d9a3]/15 text-[#00d9a3]' : 'text-zinc-400 hover:bg-zinc-800/70'
            }`}
          >
            <CalendarClock size={13} /> التقويم الاقتصادي
          </button>
          <button
            onClick={() => setTab('news')}
            className={`flex items-center gap-1.5 border-s border-zinc-800 px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'news' ? 'bg-[#00d9a3]/15 text-[#00d9a3]' : 'text-zinc-400 hover:bg-zinc-800/70'
            }`}
          >
            <Newspaper size={13} /> أخبار الكريبتو
          </button>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt > 0 && (
            <span className="hidden text-[10px] text-zinc-600 sm:inline">آخر تحديث {fmtAgoShort(updatedAt, now)}</span>
          )}
          <button
            onClick={() => void load(false)}
            title="تحديث الآن"
            className="rounded-md border border-zinc-800 p-1.5 text-zinc-400 transition-colors hover:border-[#00d9a3]/40 hover:text-[#00d9a3]"
          >
            <RefreshCcw size={13} className={refreshing || loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* high-impact warning banner */}
      {nextHigh && nextHigh.at - now < 2 * 3_600_000 && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[#ff4d4d]/40 bg-[#ff4d4d]/[0.07] px-3 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#ff4d4d]" />
          <p className="text-xs leading-relaxed text-[#ff4d4d]">
            حدث عالي التأثير {fmtCountdown(nextHigh.at - now)}:{' '}
            <span className="font-bold">{translateTitle(nextHigh.title) ?? nextHigh.title}</span>{' '}
            <span className="font-num" dir="ltr">
              ({nextHigh.currency} {nextHigh.allDay ? '' : fmtHM(nextHigh.at)})
            </span>{' '}
            — تقلبات عنيفة محتملة، انتبه لصفقاتك المفتوحة.
          </p>
        </div>
      )}

      {/* body */}
      {loading && !cal && !news ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-zinc-900" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      ) : err && !cal && !news ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-[#ff4d4d]">تعذّر جلب البيانات من المصادر الخارجية</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-500">
            قد يكون مصدر التقويم أو الأخبار محجوباً مؤقتاً. أعد المحاولة بعد قليل.
          </p>
          <button
            onClick={() => void load(false)}
            className="mt-1 flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCcw size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : tab === 'cal' ? (
        <>
          {/* filters */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setUsdOnly((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                usdOnly
                  ? 'border-[#f5c518]/50 bg-[#f5c518]/10 text-[#f5c518]'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              USD فقط
            </button>
            <button
              onClick={() => setHighOnly((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                highOnly
                  ? 'border-[#ff4d4d]/50 bg-[#ff4d4d]/10 text-[#ff4d4d]'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              عالية التأثير فقط
            </button>
            <span className="ms-auto text-[10px] text-zinc-600">الأوقات بتوقيت جهازك</span>
          </div>

          {groups.length === 0 ? (
            <p className="mt-10 text-center text-xs text-zinc-500">
              لا أحداث مطابقة للفلاتر هذا الأسبوع — جرّب إلغاء «USD فقط»
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="mt-3 overflow-hidden rounded-lg border border-zinc-800/80 bg-[#121214]">
                <h3 className="border-b border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-xs font-bold text-zinc-200">
                  {g.label}
                </h3>
                {g.events.map((e) => (
                  <EventRow key={e.id} e={e} now={now} />
                ))}
              </section>
            ))
          )}
        </>
      ) : (
        <section className="mt-3 overflow-hidden rounded-lg border border-zinc-800/80 bg-[#121214]">
          {!news || news.items.length === 0 ? (
            <p className="px-3 py-10 text-center text-xs text-zinc-500">لا أخبار متاحة حالياً</p>
          ) : (
            news.items.map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="block border-b border-zinc-900/80 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-zinc-900/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400" dir="ltr">
                      {n.source}
                    </span>
                    <span className="text-[10px] text-zinc-600">{fmtAgoShort(n.at, now)}</span>
                  </div>
                  <ExternalLink size={11} className="shrink-0 text-zinc-600" />
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-200" dir="auto">
                  {n.title}
                </p>
                {n.categories.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {n.categories.map((cat) => (
                      <span key={cat} className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[9px] text-zinc-500" dir="ltr">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))
          )}
        </section>
      )}
    </main>
  )
}
