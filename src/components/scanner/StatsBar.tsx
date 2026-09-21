import type { SymbolScan } from '@/types'
import { fmtClock } from '@/lib/format'
import { Activity, Flame, ScanSearch, Sigma, Zap } from 'lucide-react'

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-4 py-2.5 first:ps-3">
      <span className="text-zinc-600">{icon}</span>
      <div>
        <div className="text-[10px] text-zinc-500">{label}</div>
        <div className="font-num text-sm font-bold tabular-nums" style={{ color: accent ?? '#e4e4e7' }} dir="ltr">
          {value}
        </div>
      </div>
    </div>
  )
}

export function StatsBar({ scans, lastTick }: { scans: SymbolScan[]; lastTick: number }) {
  const strong = scans.filter((s) => s.strength === 'strong').length
  const normal = scans.filter((s) => s.strength === 'normal').length
  const avg = scans.length ? Math.round(scans.reduce((a, s) => a + s.score, 0) / scans.length) : 0

  return (
    <div className="flex flex-nowrap items-center overflow-x-auto border-b border-zinc-800/70 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Stat icon={<ScanSearch size={15} />} label="عملات قيد المسح" value={String(scans.length)} />
      <Stat icon={<Flame size={15} />} label="إشارات قوية" value={String(strong)} accent="#00d9a3" />
      <Stat icon={<Zap size={15} />} label="إشارات عادية" value={String(normal)} accent="#f5c518" />
      <Stat icon={<Sigma size={15} />} label="متوسط النقاط" value={String(avg)} />
      <Stat icon={<Activity size={15} />} label="آخر تحديث" value={fmtClock(lastTick)} />
    </div>
  )
}
