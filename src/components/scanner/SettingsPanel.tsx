import { useState } from 'react'
import { INDICATOR_LIST, type ScannerSettings, type Timeframe } from '@/types'
import { api } from '@/lib/api'
import { Check, Loader2, Send, X } from 'lucide-react'

interface Props {
  settings: ScannerSettings
  onChange: (patch: Partial<ScannerSettings>) => void
  onClose: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
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
      <span className="font-num w-12 text-end text-xs text-[#00d9a3] tabular-nums" dir="ltr">
        {value}
        {unit ?? ''}
      </span>
    </>
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

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  const s = settings
  const [urlDraft, setUrlDraft] = useState(s.webhookUrl)
  const [testing, setTesting] = useState(false)
  const [testRes, setTestRes] = useState<null | 'ok' | 'fail'>(null)

  const saveUrl = () => {
    const url = urlDraft.trim()
    if (url !== s.webhookUrl) onChange({ webhookUrl: url })
  }

  const runTest = async () => {
    const url = urlDraft.trim()
    setTesting(true)
    setTestRes(null)
    try {
      onChange({ webhookUrl: url }) // sync UI state
      await api.saveSettings({ webhookUrl: url }) // guarantee the server has it before testing
      const r = await api.webhookTest()
      setTestRes(r.ok ? 'ok' : 'fail')
    } catch {
      setTestRes('fail')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-x-3 top-14 z-50 mt-2 max-h-[80vh] overflow-y-auto rounded-lg border border-zinc-800 bg-[#121214] p-4 shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:w-80">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">إعدادات السكانر</h3>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>

      <div className="divide-y divide-zinc-800/70">
        <Row label="عدد العملات الممسوحة">
          <div className="flex overflow-hidden rounded border border-zinc-800" dir="ltr">
            {[15, 30, 50].map((n) => (
              <button
                key={n}
                onClick={() => onChange({ symbolCount: n })}
                className={`px-2.5 py-1 text-xs font-num transition-colors ${
                  s.symbolCount === n ? 'bg-[#00d9a3] font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </Row>

        <Row label="الفريم الرئيسي للإشارات">
          <div className="flex overflow-hidden rounded border border-zinc-800" dir="ltr">
            {(['1m', '5m'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => onChange({ primaryTf: tf })}
                className={`px-3 py-1 text-xs font-num transition-colors ${
                  s.primaryTf === tf ? 'bg-[#00d9a3] font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </Row>

        <Row label="حد الإشارة القوية">
          <Slider value={s.strongThreshold} min={60} max={90} step={5} onChange={(v) => onChange({ strongThreshold: v })} />
        </Row>

        <Row label="حد الإشارة العادية">
          <Slider
            value={s.normalThreshold}
            min={40}
            max={70}
            step={5}
            onChange={(v) => onChange({ normalThreshold: Math.min(v, s.strongThreshold - 5) })}
          />
        </Row>

        <Row label="الحد الأدنى للسيولة اليومية">
          <Slider value={s.minQuoteVolM} min={1} max={50} step={1} unit="M$" onChange={(v) => onChange({ minQuoteVolM: v })} />
        </Row>

        <Row label="مضاعف انفجار الحجم">
          <Slider value={s.volSpikeX} min={1.5} max={5} step={0.5} unit="×" onChange={(v) => onChange({ volSpikeX: v })} />
        </Row>

        <Row label="التهدئة بين تنبيهات العملة">
          <Slider value={s.cooldownMin} min={1} max={10} step={1} unit=" د" onChange={(v) => onChange({ cooldownMin: v })} />
        </Row>

        <Row label="إخفاء المعادن والنفط والأسهم">
          <Switch on={s.hideTradFi ?? false} onClick={() => onChange({ hideTradFi: !s.hideTradFi })} />
        </Row>

        <Row label="إخفاء عملات الإقراض (Lending)">
          <Switch on={s.hideLending ?? false} onClick={() => onChange({ hideLending: !s.hideLending })} />
        </Row>

        <Row label="إخفاء عملات القمار (Gambling)">
          <Switch on={s.hideGambling ?? false} onClick={() => onChange({ hideGambling: !s.hideGambling })} />
        </Row>
      </div>

      <h4 className="mt-3 border-t border-zinc-800/70 pt-3 text-[11px] font-semibold text-zinc-400">
        المؤشرات المفعّلة
      </h4>
      <div className="grid grid-cols-2 gap-1.5 py-2">
        {INDICATOR_LIST.map((ind) => {
          const enabled = s.indicators?.[ind.key] !== false
          return (
            <button
              key={ind.key}
              onClick={() => onChange({ indicators: { ...s.indicators, [ind.key]: !enabled } })}
              title={enabled ? 'اضغط للتعطيل' : 'اضغط للتفعيل'}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                enabled
                  ? 'border-[#00d9a3]/40 bg-[#00d9a3]/10 text-[#00d9a3]'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${enabled ? 'bg-[#00d9a3]' : 'bg-zinc-700'}`} />
              {ind.label}
            </button>
          )
        })}
      </div>
      <p className="pb-1 text-[10px] leading-relaxed text-zinc-600">
        تعطيل مؤشر يزيل نقاطه من حساب الإشارة فوراً على السيرفر.
      </p>

      <h4 className="mt-3 border-t border-zinc-800/70 pt-3 text-[11px] font-semibold text-zinc-400">
        الويب هوك المخصص (JSON)
      </h4>
      <div className="py-2">
        <input
          dir="ltr"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onBlur={saveUrl}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveUrl()
          }}
          placeholder="https://your-server.com/webhook"
          className="w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-2.5 py-1.5 font-num text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#00d9a3]/50 focus:outline-none"
        />
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
          يُرسل السيرفر POST بصيغة JSON لكل إشارة: الرمز، القوة، النقاط، السعر، ومكوّنات الإشارة.
        </p>
      </div>
      <Row label="إرسال تلقائي عند كل إشارة">
        <Switch on={s.webhookOn} onClick={() => onChange({ webhookOn: !s.webhookOn })} />
      </Row>
      <div className="flex items-center gap-2 py-1.5">
        <button
          onClick={() => void runTest()}
          disabled={testing || !urlDraft.trim()}
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-[#00d9a3]/40 hover:text-[#00d9a3] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          تجربة الإرسال
        </button>
        {testRes === 'ok' && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#00d9a3]">
            <Check size={11} /> تم الاستلام بنجاح
          </span>
        )}
        {testRes === 'fail' && <span className="text-[10px] text-[#ff4d4d]">فشل الإرسال — تأكد من الرابط</span>}
      </div>

      <h4 className="mt-3 border-t border-zinc-800/70 pt-3 text-[11px] font-semibold text-zinc-400">
        فترات جلب البيانات (السيرفر)
      </h4>
      <div className="divide-y divide-zinc-800/70">
        <Row label="دورة حساب الإشارات">
          <Slider
            value={s.tickMs}
            min={500}
            max={5000}
            step={250}
            unit="ms"
            onChange={(v) => onChange({ tickMs: v })}
          />
        </Row>

        <Row label="تحديث السيولة والتمويل/OI">
          <Slider
            value={s.refreshSec}
            min={15}
            max={600}
            step={15}
            unit=" ث"
            onChange={(v) => onChange({ refreshSec: v })}
          />
        </Row>
      </div>

      <p className="mt-3 border-t border-zinc-800/70 pt-2 text-[10px] leading-relaxed text-zinc-600">
        تغيير عدد العملات يعيد تشغيل السكانر على السيرفر. رفع الفترات يخفف الضغط على المنصة ويحمي IP السيرفر من
        الحظر. بقية الإعدادات تُطبق فوراً.
      </p>
    </div>
  )
}
