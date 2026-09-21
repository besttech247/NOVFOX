import { useEffect, useRef, useState } from 'react'
import { EXCHANGES } from '@/lib/exchanges'
import type { ExchangeId, MarketType, ScannerSettings } from '@/types'
import {
  DEFAULT_BT_PARAMS,
  runBacktest,
  type BacktestParams,
  type BacktestResult,
  type BacktestTrade,
} from '@/lib/backtest'
import { fmtPrice } from '@/lib/format'
import { FlaskConical, Play, Square } from 'lucide-react'

// ---------- equity curve canvas ----------
function EquityChart({ equity }: { equity: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || equity.length < 2) return
    const parent = canvas.parentElement!
    const width = parent.clientWidth
    const height = 160
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const min = Math.min(0, ...equity)
    const max = Math.max(0, ...equity)
    const span = max - min || 1
    const x = (i: number) => (i / (equity.length - 1)) * (width - 8) + 4
    const y = (v: number) => height - 8 - ((v - min) / span) * (height - 16)

    // zero line
    ctx.strokeStyle = 'rgba(113,113,122,0.4)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, y(0))
    ctx.lineTo(width, y(0))
    ctx.stroke()
    ctx.setLineDash([])

    // area
    const final = equity[equity.length - 1]
    const color = final >= 0 ? '#00d9a3' : '#ff4d4d'
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, final >= 0 ? 'rgba(0,217,163,0.25)' : 'rgba(255,77,77,0.2)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.beginPath()
    ctx.moveTo(x(0), y(equity[0]))
    equity.forEach((v, i) => ctx.lineTo(x(i), y(v)))
    ctx.lineTo(x(equity.length - 1), height)
    ctx.lineTo(x(0), height)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // line
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.lineJoin = 'round'
    equity.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))))
    ctx.stroke()
  }, [equity])
  return <canvas ref={ref} className="block w-full" style={{ height: 160 }} dir="ltr" />
}

// ---------- small controls ----------
function NumInput({
  label,
  value,
  onChange,
  step = 0.05,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  suffix?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent font-num text-sm text-zinc-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          dir="ltr"
        />
        {suffix && <span className="text-[10px] text-zinc-500">{suffix}</span>}
      </span>
    </label>
  )
}

function ChoiceRow<T extends number>({
  label,
  options,
  value,
  onChange,
  fmt,
}: {
  label: string
  options: T[]
  value: T
  onChange: (v: T) => void
  fmt?: (v: T) => string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-zinc-800" dir="ltr">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`flex-1 px-2 py-1.5 text-xs font-num transition-colors ${
              value === o ? 'bg-[#00d9a3] font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            {fmt ? fmt(o) : o}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- stat card ----------
function BigStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-[#121214] p-3">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 font-num text-lg font-bold tabular-nums" style={{ color: color ?? '#e4e4e7' }} dir="ltr">
        {value}
      </div>
    </div>
  )
}

const REASON_LABEL: Record<BacktestTrade['reason'], string> = {
  target: 'هدف',
  stop: 'وقف',
  time: 'زمني',
}

export function BacktestView({
  exchange,
  market,
  settings,
}: {
  exchange: ExchangeId
  market: MarketType
  settings: ScannerSettings
}) {
  const [params, setParams] = useState<BacktestParams>(DEFAULT_BT_PARAMS)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  const start = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    cancelRef.current = false
    try {
      const res = await runBacktest(
        EXCHANGES[exchange][market],
        settings,
        params,
        (done, total, label) => setProgress({ done, total, label }),
        () => cancelRef.current,
      )
      setResult(res)
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') {
        /* cancelled silently */
      } else {
        setError(e instanceof Error ? e.message : 'فشل تشغيل الباك تست')
      }
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const pnlColor = (v: number) => (v >= 0 ? '#00d9a3' : '#ff4d4d')

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-4">
      {/* controls */}
      <div className="rounded-lg border border-zinc-800/80 bg-[#121214] p-4">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical size={15} className="text-[#00d9a3]" />
          <h2 className="text-sm font-bold text-zinc-100">باك تست — محاكاة الإشارات على بيانات تاريخية</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ChoiceRow label="المدة" options={[3, 7, 14]} value={params.days} onChange={(v) => setParams({ ...params, days: v })} fmt={(v) => `${v} يوم`} />
          <ChoiceRow label="عدد العملات" options={[5, 10, 20]} value={params.symbolCount} onChange={(v) => setParams({ ...params, symbolCount: v })} />
          <NumInput label="وقف الخسارة" value={params.stopLossPct} step={0.1} suffix="%" onChange={(v) => setParams({ ...params, stopLossPct: v })} />
          <NumInput label="الهدف" value={params.takeProfitPct} step={0.05} suffix="%" onChange={(v) => setParams({ ...params, takeProfitPct: v })} />
          <NumInput label="خروج زمني (شموع)" value={params.timeStopCandles} step={1} onChange={(v) => setParams({ ...params, timeStopCandles: Math.round(v) })} />
          <NumInput label="عمولة + انزلاق" value={params.feePct + params.slippagePct} step={0.05} suffix="%" onChange={(v) => setParams({ ...params, feePct: Math.max(0, v - params.slippagePct) })} />
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          يستخدم نفس محرك الإشارات وعتباتك الحالية (قوية ≥ {settings.strongThreshold} · عادية ≥ {settings.normalThreshold})
          على فريم {settings.primaryTf} — سوق {market === 'futures' ? 'الفيوتشر' : 'السبوت'}. النتائج بعد خصم العمولات.
          {market === 'futures' && ' ملاحظة: بيانات Funding وOpen Interest غير متاحة تاريخياً، فلا تدخل في المحاكاة.'}
        </p>
        <div className="mt-3 flex items-center gap-3">
          {!running ? (
            <button
              onClick={start}
              className="flex items-center gap-2 rounded-md bg-[#00d9a3] px-5 py-2 text-sm font-bold text-black transition-opacity hover:opacity-85"
            >
              <Play size={14} /> تشغيل الباك تست
            </button>
          ) : (
            <button
              onClick={() => (cancelRef.current = true)}
              className="flex items-center gap-2 rounded-md bg-[#ff4d4d] px-5 py-2 text-sm font-bold text-black transition-opacity hover:opacity-85"
            >
              <Square size={14} /> إيقاف
            </button>
          )}
          {progress && running && (
            <div className="flex flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[#00d9a3] transition-all"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
              <span className="font-num text-xs text-zinc-400" dir="ltr">
                {progress.done}/{progress.total} {progress.label}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-[#ff4d4d]">{error}</p>}

      {/* results */}
      {result && (
        <div className="mt-4 space-y-4">
          {result.totalTrades === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-[#121214] p-6 text-center text-sm text-zinc-500">
              لم تتولد أي صفقة بهذه الإعدادات — جرّب مدة أطول أو خفّض عتبة الإشارة العادية من الإعدادات.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <BigStat label="إجمالي الصفقات" value={String(result.totalTrades)} />
                <BigStat label="نسبة الفوز" value={`${result.winRate.toFixed(1)}%`} color={result.winRate >= 50 ? '#00d9a3' : '#ff4d4d'} />
                <BigStat
                  label="Profit Factor"
                  value={result.profitFactor === null ? '—' : result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}
                  color={result.profitFactor !== null && result.profitFactor >= 1.3 ? '#00d9a3' : '#f5c518'}
                />
                <BigStat label="صافي الربح التراكمي" value={`${result.netPnlPct >= 0 ? '+' : ''}${result.netPnlPct.toFixed(2)}%`} color={pnlColor(result.netPnlPct)} />
                <BigStat label="أقصى تراجع" value={`-${result.maxDrawdownPct.toFixed(2)}%`} color="#ff4d4d" />
                <BigStat label="التوقع لكل صفقة" value={`${result.expectancyPct >= 0 ? '+' : ''}${result.expectancyPct.toFixed(3)}%`} color={pnlColor(result.expectancyPct)} />
              </div>

              {/* equity curve */}
              <div className="rounded-lg border border-zinc-800/80 bg-[#121214] p-3">
                <div className="mb-2 text-xs font-semibold text-zinc-400">منحنى رأس المال (مجموع ربح/خسارة الصفقات %)</div>
                <EquityChart equity={result.equity} />
              </div>

              {/* component breakdown */}
              <div className="rounded-lg border border-zinc-800/80 bg-[#121214] p-3">
                <div className="mb-2 text-xs font-semibold text-zinc-400">أداء كل مكوّن من مكوّنات الإشارة</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[11px] text-zinc-500">
                        <th className="py-2 text-start font-medium">المكوّن</th>
                        <th className="py-2 text-start font-medium">الصفقات</th>
                        <th className="py-2 text-start font-medium">نسبة الفوز</th>
                        <th className="py-2 text-start font-medium">متوسط الربح</th>
                        <th className="py-2 text-start font-medium">التقييم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.partStats.map((ps) => (
                        <tr key={ps.key} className="border-b border-zinc-900">
                          <td className="py-2 text-zinc-200">{ps.label}</td>
                          <td className="py-2 font-num tabular-nums text-zinc-300" dir="ltr">{ps.trades}</td>
                          <td className="py-2 font-num tabular-nums" dir="ltr" style={{ color: ps.winRate >= 50 ? '#00d9a3' : '#ff4d4d' }}>
                            {ps.winRate.toFixed(0)}%
                          </td>
                          <td className="py-2 font-num tabular-nums" dir="ltr" style={{ color: pnlColor(ps.avgPnl) }}>
                            {ps.avgPnl >= 0 ? '+' : ''}{ps.avgPnl.toFixed(2)}%
                          </td>
                          <td className="py-2 text-xs">
                            {ps.avgPnl > 0.05 ? (
                              <span className="rounded bg-[#00d9a3]/10 px-1.5 py-0.5 text-[#00d9a3]">مربح</span>
                            ) : ps.avgPnl < -0.05 ? (
                              <span className="rounded bg-[#ff4d4d]/10 px-1.5 py-0.5 text-[#ff4d4d]">يخسر — خفّض وزنه</span>
                            ) : (
                              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">محايد</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* recent trades */}
              <div className="rounded-lg border border-zinc-800/80 bg-[#121214] p-3">
                <div className="mb-2 text-xs font-semibold text-zinc-400">آخر {Math.min(40, result.trades.length)} صفقة</div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead className="sticky top-0 bg-[#121214]">
                      <tr className="border-b border-zinc-800 text-[10px] text-zinc-500">
                        <th className="py-1.5 text-start font-medium">العملة</th>
                        <th className="py-1.5 text-start font-medium">الدخول</th>
                        <th className="py-1.5 text-start font-medium">سعر الدخول</th>
                        <th className="py-1.5 text-start font-medium">الخروج</th>
                        <th className="py-1.5 text-start font-medium">السبب</th>
                        <th className="py-1.5 text-start font-medium">النقاط</th>
                        <th className="py-1.5 text-start font-medium">الربح/الخسارة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.slice(0, 40).map((t, i) => (
                        <tr key={i} className="border-b border-zinc-900/70">
                          <td className="py-1.5 font-semibold text-zinc-200">{t.base}</td>
                          <td className="py-1.5 font-num text-zinc-500" dir="ltr">
                            {new Date(t.entryTime).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-1.5 font-num tabular-nums text-zinc-300" dir="ltr">{fmtPrice(t.entry)}</td>
                          <td className="py-1.5 font-num tabular-nums text-zinc-300" dir="ltr">{fmtPrice(t.exit)}</td>
                          <td className="py-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] ${
                                t.reason === 'target'
                                  ? 'bg-[#00d9a3]/10 text-[#00d9a3]'
                                  : t.reason === 'stop'
                                    ? 'bg-[#ff4d4d]/10 text-[#ff4d4d]'
                                    : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {REASON_LABEL[t.reason]}
                            </span>
                          </td>
                          <td className="py-1.5 font-num tabular-nums text-zinc-400" dir="ltr">{t.score}</td>
                          <td className="py-1.5 font-num font-bold tabular-nums" dir="ltr" style={{ color: pnlColor(t.pnlPct) }}>
                            {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-[10px] leading-relaxed text-zinc-600">
                اختُبرت {result.symbolsTested} عملة · {result.candlesTested.toLocaleString('en-US')} شمعة. تنبيه: الأداء
                التاريخي لا يضمن النتائج المستقبلية، والمحاكاة تفترض تنفيذاً فورياً بسعر افتتاح الشمعة التالية.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
