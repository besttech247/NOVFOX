import type { AlertItem, MarketType } from '@/types'
import { fmtAgo, fmtPrice } from '@/lib/format'
import { getTradingViewUrl } from '@/lib/tradingview'
import { CoinIcon } from '@/components/CoinIcon'
import { ExchangeIcon } from '@/components/ExchangeIcon'
import { BellOff, ChevronDown, ChevronUp, Flame, Zap } from 'lucide-react'

export function AlertsFeed({
  alerts,
  onClear,
  now,
  collapsed,
  onToggleCollapse,
  icons = {},
  market = 'futures',
}: {
  alerts: AlertItem[]
  onClear: () => void
  now: number
  collapsed: boolean
  onToggleCollapse: () => void
  icons?: Record<string, string>
  market?: MarketType
}) {
  if (alerts.length === 0) return null

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-zinc-300 transition-colors hover:text-zinc-100"
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          أحدث التنبيهات القوية
          <span className="rounded-full bg-zinc-700 px-1.5 text-[10px] font-bold text-zinc-200">{alerts.length}</span>
        </button>
        {!collapsed && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <BellOff size={11} /> مسح الكل
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`flex min-w-[200px] shrink-0 flex-col gap-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2.5 shadow-sm transition-colors ${
                a.strength === 'strong' ? 'border-[#00d9a3]/30 bg-[#00d9a3]/[0.05]' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {a.strength === 'strong' ? (
                    <Flame size={12} className="shrink-0 text-[#00d9a3]" />
                  ) : (
                    <Zap size={12} className="shrink-0 text-[#f5c518]" />
                  )}
                  <CoinIcon base={a.base} icons={icons} size={14} />
                  <span className="font-semibold text-zinc-100 text-xs">{a.base}</span>
                  <ExchangeIcon exchange={a.exchange} size={13} className="rounded-sm" />
                  {a.market && (
                    <span
                      className={`rounded px-1 text-[7px] font-bold border ${
                        a.market === 'futures'
                          ? 'border-purple-500/40 bg-purple-500/20 text-purple-300'
                          : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {a.market === 'futures' ? 'PERP' : 'SPOT'}
                    </span>
                  )}
                </div>
                <span className="font-num text-[10px] text-zinc-400" dir="ltr">
                  {fmtPrice(a.price)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-num text-[10px] font-bold tabular-nums"
                    style={{ color: a.strength === 'strong' ? '#00d9a3' : '#f5c518' }}
                  >
                    {a.score} pts
                  </span>
                  <a
                    href={getTradingViewUrl(a.exchange, a.symbol, a.base, market)}
                    target="_blank"
                    rel="noreferrer"
                    title="فتح في TradingView"
                    className="rounded border border-zinc-700/80 px-1 py-0.5 text-[8px] font-semibold text-zinc-400 transition-colors hover:border-[#3179f5]/60 hover:text-[#3179f5]"
                  >
                    TV
                  </a>
                </div>
                <span className="text-[9px] text-zinc-600">{fmtAgo(a.time, now)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
