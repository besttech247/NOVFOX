import type { SymbolScan } from '@/types'
import { journalStats, type JournalEntry } from '@/hooks/useJournal'
import { fmtClock, fmtPrice } from '@/lib/format'
import { BookOpen, Check, Trash2 } from 'lucide-react'

interface Props {
  entries: JournalEntry[]
  scans: SymbolScan[]
  onClose: (id: string, exitPrice: number) => void
  onRemove: (id: string) => void
  onClearClosed: () => void
}

function pnl(e: JournalEntry, current?: number): number | null {
  const exit = e.exitPrice ?? current
  if (exit === undefined) return null
  return ((exit - e.entryPrice) / e.entryPrice) * 100
}

const color = (v: number) => (v >= 0 ? '#00d9a3' : '#ff4d4d')

export function JournalView({ entries, scans, onClose, onRemove, onClearClosed }: Props) {
  const stats = journalStats(entries)
  const priceOf = (symbol: string) => scans.find((s) => s.meta.symbol === symbol)?.meta.price

  const open = entries.filter((e) => e.exitPrice === undefined)
  const closed = entries.filter((e) => e.exitPrice !== undefined)

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-4">
      {/* stats */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          { l: 'صفقات مفتوحة', v: String(stats.open) },
          { l: 'صفقات مغلقة', v: String(stats.closed) },
          { l: 'نسبة الفوز', v: `${stats.winRate.toFixed(0)}%`, c: stats.winRate >= 50 ? '#00d9a3' : '#ff4d4d' },
          { l: 'صافي الربح', v: `${stats.netPnl >= 0 ? '+' : ''}${stats.netPnl.toFixed(2)}%`, c: color(stats.netPnl) },
          { l: 'أفضل صفقة', v: `+${stats.best.toFixed(2)}%`, c: '#00d9a3' },
          { l: 'أسوأ صفقة', v: `${stats.worst.toFixed(2)}%`, c: '#ff4d4d' },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-zinc-800/80 bg-[#121214] p-3">
            <div className="text-[10px] text-zinc-500">{s.l}</div>
            <div className="mt-0.5 font-num text-base font-bold tabular-nums" style={{ color: s.c ?? '#e4e4e7' }} dir="ltr">
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-800/80 bg-[#121214] py-16 text-zinc-600">
          <BookOpen size={28} />
          <p className="max-w-sm text-center text-sm leading-relaxed">
            سجلك فارغ. من شاشة المسح الحي، اضغط زر «دخلت» بجانب أي إشارة عند فتح صفقتها فعلياً — وسيتتبع السجل ربحك
            وخسارتك بنسبة الفوز التراكمية.
          </p>
        </div>
      ) : (
        <>
          {/* open positions */}
          {open.length > 0 && (
            <div className="rounded-lg border border-zinc-800/80 bg-[#121214] p-3">
              <h3 className="mb-2 text-xs font-semibold text-zinc-300">صفقات مفتوحة ({open.length})</h3>
              <div className="space-y-2">
                {open.map((e) => {
                  const cur = priceOf(e.symbol)
                  const p = pnl(e, cur)
                  return (
                    <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-[#f5c518]/20 bg-[#f5c518]/[0.03] p-2.5">
                      <div className="min-w-20">
                        <div className="text-sm font-bold text-zinc-100">{e.base}</div>
                        <div className="font-num text-[10px] text-zinc-500" dir="ltr">{fmtClock(e.entryTime)}</div>
                      </div>
                      <div className="font-num text-xs text-zinc-400" dir="ltr">
                        دخول: <span className="text-zinc-200">{fmtPrice(e.entryPrice)}</span>
                      </div>
                      {cur !== undefined && (
                        <div className="font-num text-xs text-zinc-400" dir="ltr">
                          الآن: <span className="text-zinc-200">{fmtPrice(cur)}</span>
                        </div>
                      )}
                      {p !== null && (
                        <div className="font-num text-sm font-bold tabular-nums" style={{ color: color(p) }} dir="ltr">
                          {p >= 0 ? '+' : ''}{p.toFixed(2)}%
                        </div>
                      )}
                      <div className="ms-auto flex items-center gap-1.5">
                        {cur !== undefined && (
                          <button
                            onClick={() => onClose(e.id, cur)}
                            className="flex items-center gap-1 rounded border border-[#00d9a3]/40 bg-[#00d9a3]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#00d9a3] hover:bg-[#00d9a3]/20"
                          >
                            <Check size={12} /> إغلاق بالسعر الحالي
                          </button>
                        )}
                        <button
                          onClick={() => onRemove(e.id)}
                          className="rounded border border-zinc-800 p-1.5 text-zinc-500 hover:text-[#ff4d4d]"
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* closed trades */}
          {closed.length > 0 && (
            <div className="rounded-lg border border-zinc-800/80 bg-[#121214] p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-300">صفقات مغلقة ({closed.length})</h3>
                <button onClick={onClearClosed} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                  مسح المغلقة
                </button>
              </div>
              <div className="space-y-1.5">
                {closed.map((e) => {
                  const p = pnl(e)!
                  return (
                    <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-zinc-800/60 p-2.5">
                      <span className="text-sm font-semibold text-zinc-200">{e.base}</span>
                      <span className="font-num text-xs text-zinc-500" dir="ltr">
                        {fmtPrice(e.entryPrice)} → {fmtPrice(e.exitPrice!)}
                      </span>
                      <span className="font-num text-xs text-zinc-600" dir="ltr">
                        {fmtClock(e.entryTime)} → {fmtClock(e.exitTime!)}
                      </span>
                      <span className="ms-auto font-num text-sm font-bold tabular-nums" style={{ color: color(p) }} dir="ltr">
                        {p >= 0 ? '+' : ''}{p.toFixed(2)}%
                      </span>
                      <button
                        onClick={() => onRemove(e.id)}
                        className="rounded p-1 text-zinc-600 hover:text-[#ff4d4d]"
                        title="حذف"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-[10px] leading-relaxed text-zinc-600">
        ملاحظة: السجل يُحفظ في متصفحك فقط (localStorage) — لن يتزامن بين أجهزتك، ومسح بيانات المتصفح يفقده.
      </p>
    </div>
  )
}
