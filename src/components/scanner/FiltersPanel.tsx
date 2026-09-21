import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import type { DisplayFilters } from '@/types'

interface Props {
  hideTradFi: boolean
  onTradFiChange: (val: boolean) => void
  filters: DisplayFilters
  onChange: (patch: Partial<DisplayFilters>) => void
  onReset: () => void
  onClose: () => void
}

function Row({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        {sub && <span className="text-[10px] text-zinc-500">{sub}</span>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Switch({ on, onClick, title }: { on: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      title={title}
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-[#00d9a3]' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'start-[18px]' : 'start-0.5'}`}
      />
    </button>
  )
}

function Slider({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider-mint w-28"
        dir="ltr"
      />
      <span className="font-num w-10 text-end text-xs tabular-nums text-[#00d9a3]" dir="ltr">
        {value}
        {unit ?? ''}
      </span>
    </>
  )
}

export function FiltersPanel({ hideTradFi, onTradFiChange, filters, onChange, onReset, onClose }: Props) {
  const f = filters

  const isFiltered =
    hideTradFi ||
    f.hideMetals ||
    f.hideOil ||
    f.hideStocks ||
    f.hideLending ||
    f.hideGambling ||
    f.minScore > 0 ||
    f.strength !== 'all' ||
    f.direction !== 'all'

  return (
    <div className="fixed inset-x-3 top-14 z-50 mt-2 max-h-[85vh] overflow-y-auto rounded-lg border border-zinc-800 bg-[#121214] p-4 shadow-2xl shadow-black/70 sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:w-84">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#00d9a3]/10 text-[#00d9a3]">
            <SlidersHorizontal size={13} />
          </span>
          <h3 className="text-sm font-semibold text-zinc-200">فلاتر العرض</h3>
        </div>
        <div className="flex items-center gap-2">
          {isFiltered && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-[#00d9a3]"
              title="إعادة ضبط جميع الفلاتر"
            >
              <RotateCcw size={11} />
              <span>إعادة تعيين</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="إغلاق"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="divide-y divide-zinc-800/70">
        {/* Section 1: TradFi & Commodities */}
        <div className="py-1">
          <Row
            label="إخفاء المعادن والنفط والأسهم"
            sub="عرض العملات الرقمية فقط (كريبتو)"
          >
            <Switch
              on={hideTradFi}
              onClick={() => onTradFiChange(!hideTradFi)}
            />
          </Row>

          {/* Sub-toggles if not fully hiding everything */}
          {!hideTradFi && (
            <div className="me-2 space-y-0.5 border-s-2 border-zinc-800 ps-3">
              <Row label="إخفاء المعادن (ذهب، فضة...)">
                <Switch
                  on={f.hideMetals}
                  onClick={() => onChange({ hideMetals: !f.hideMetals })}
                />
              </Row>
              <Row label="إخفاء النفط والطاقة (برنت، WTI...)">
                <Switch
                  on={f.hideOil}
                  onClick={() => onChange({ hideOil: !f.hideOil })}
                />
              </Row>
              <Row label="إخفاء الأسهم والمؤشرات (NVDA, TSLA...)">
                <Switch
                  on={f.hideStocks}
                  onClick={() => onChange({ hideStocks: !f.hideStocks })}
                />
              </Row>
            </div>
          )}
        </div>

        {/* Section 2: DeFi Lending & Gambling Tokens */}
        <div className="py-1">
          <Row
            label="إخفاء عملات الإقراض (Lending)"
            sub="AAVE, COMP, MKR, RDNT, XVS, MORPHO..."
          >
            <Switch
              on={f.hideLending}
              onClick={() => onChange({ hideLending: !f.hideLending })}
            />
          </Row>
          <Row
            label="إخفاء عملات القمار والكازينو (Gambling)"
            sub="RLB, FUN, WIN, SHFL, SX, DICE..."
          >
            <Switch
              on={f.hideGambling}
              onClick={() => onChange({ hideGambling: !f.hideGambling })}
            />
          </Row>
        </div>

        {/* Section 2: Strength Filter */}
        <div className="py-1">
          <Row label="قوة الإشارة">
            <div className="flex overflow-hidden rounded border border-zinc-800" dir="rtl">
              <button
                onClick={() => onChange({ strength: 'all' })}
                className={`px-3 py-1 text-xs transition-colors ${
                  f.strength === 'all' ? 'bg-[#00d9a3] font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => onChange({ strength: 'strong' })}
                className={`px-3 py-1 text-xs transition-colors ${
                  f.strength === 'strong' ? 'bg-[#00d9a3] font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                قوية فقط
              </button>
            </div>
          </Row>
        </div>

        {/* Section 3: Signal Direction (Long / Short) */}
        <div className="py-1">
          <Row label="اتجاه الإشارة">
            <div className="flex overflow-hidden rounded border border-zinc-800" dir="rtl">
              <button
                onClick={() => onChange({ direction: 'all' })}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  f.direction === 'all' ? 'bg-[#00d9a3] font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => onChange({ direction: 'long' })}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  f.direction === 'long' ? 'bg-emerald-500 font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                شراء (Long)
              </button>
              <button
                onClick={() => onChange({ direction: 'short' })}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  f.direction === 'short' ? 'bg-rose-500 font-bold text-white' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                بيع (Short)
              </button>
            </div>
          </Row>
        </div>

        {/* Section 4: Minimum Score */}
        <div className="py-1">
          <Row label="الحد الأدنى للنقاط" sub="إخفاء العملات ذات النقاط الأقل">
            <Slider
              value={f.minScore}
              min={0}
              max={85}
              step={5}
              onChange={(v) => onChange({ minScore: v })}
            />
          </Row>
        </div>
      </div>
    </div>
  )
}
