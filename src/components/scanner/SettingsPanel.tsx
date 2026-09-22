import { useState } from 'react'
import { INDICATOR_LIST, type ScannerSettings, type Timeframe } from '@/types'
import { api } from '@/lib/api'
import { NovfoxLogo, type LogoVariant } from '@/components/NovfoxLogo'
import { AlertCircle, Check, KeyRound, Loader2, Lock, Palette, Send, X } from 'lucide-react'

export interface AppBranding {
  appName: string
  logoVariant: LogoVariant
  customLogoUrl?: string
}

interface Props {
  settings: ScannerSettings
  onChange: (patch: Partial<ScannerSettings>) => void
  onClose: () => void
  isLocked?: boolean
  branding: AppBranding
  onBrandingChange: (patch: Partial<AppBranding>) => void
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
  disabled,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  unit?: string
  disabled?: boolean
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
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider-mint w-28 disabled:cursor-not-allowed disabled:opacity-40"
        dir="ltr"
      />
      <span className="font-num w-12 text-end text-xs tabular-nums text-[#00d9a3]" dir="ltr">
        {value}
        {unit ?? ''}
      </span>
    </>
  )
}

function Switch({ on, onClick, title, disabled }: { on: boolean; onClick: () => void; title?: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? 'bg-[#00d9a3]' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'start-[18px]' : 'start-0.5'}`}
      />
    </button>
  )
}

export function SettingsPanel({
  settings,
  onChange,
  onClose,
  isLocked = false,
  branding,
  onBrandingChange,
}: Props) {
  const s = settings
  const [urlDraft, setUrlDraft] = useState(s.webhookUrl)
  const [testing, setTesting] = useState(false)
  const [testRes, setTestRes] = useState<null | 'ok' | 'fail'>(null)

  // Password change state
  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [passLoading, setPassLoading] = useState(false)
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const saveUrl = () => {
    if (isLocked) return
    const url = urlDraft.trim()
    if (url !== s.webhookUrl) onChange({ webhookUrl: url })
  }

  const runTest = async () => {
    const url = urlDraft.trim()
    setTesting(true)
    setTestRes(null)
    try {
      if (!isLocked) onChange({ webhookUrl: url })
      await api.saveSettings({ webhookUrl: url })
      const r = await api.webhookTest()
      setTestRes(r.ok ? 'ok' : 'fail')
    } catch {
      setTestRes('fail')
    } finally {
      setTesting(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassMsg(null)
    if (!curPass) {
      setPassMsg({ type: 'err', text: 'يرجى كتابة كلمة المرور الحالية' })
      return
    }
    if (newPass.length < 4) {
      setPassMsg({ type: 'err', text: 'كلمة المرور يجب أن تكون 4 خانات على الأقل' })
      return
    }
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'err', text: 'كلمتا المرور غير متطابقتين' })
      return
    }

    setPassLoading(true)
    try {
      await api.changePassword(curPass, newPass)
      setPassMsg({ type: 'ok', text: 'تم تحديث كلمة المرور بنجاح!' })
      setCurPass('')
      setNewPass('')
      setConfirmPass('')
    } catch {
      setPassMsg({ type: 'err', text: 'كلمة المرور الحالية غير صحيحة' })
    } finally {
      setPassLoading(false)
    }
  }

  return (
    <div className="fixed inset-x-3 top-14 z-50 mt-2 max-h-[85vh] overflow-y-auto rounded-lg border border-zinc-800 bg-[#121214] p-4 shadow-2xl shadow-black/70 sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:w-92">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <h3 className="text-sm font-semibold text-zinc-200">الإعدادات العامة</h3>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>

      {/* Lock banner if locked */}
      {isLocked && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <Lock size={14} className="shrink-0 text-amber-400" />
          <span>القفل مفعّل — جميع الإعدادات للقراءة فقط لمنع التعديل العرضي.</span>
        </div>
      )}

      {/* Section 1: Branding & Identity */}
      <div className="mb-3 border-b border-zinc-800/70 pb-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-300">
          <Palette size={13} className="text-[#00d9a3]" />
          <span>تخصيص الاسم والشعار</span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] text-zinc-400">اسم النظام / التطبيق</label>
            <input
              type="text"
              value={branding.appName}
              disabled={isLocked}
              onChange={(e) => onBrandingChange({ appName: e.target.value })}
              className="mt-1 w-full rounded border border-zinc-800 bg-[#0a0a0a] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-[#00d9a3]/60 focus:outline-none disabled:opacity-40"
              placeholder="مثلاً: NOVFOX"
            />
          </div>

          <div>
            <label className="text-[11px] text-zinc-400">نمط الشعار</label>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'fox', label: 'NOVFOX' },
                  { id: 'radar', label: 'رادار' },
                  { id: 'flame', label: 'شعلة' },
                  { id: 'zap', label: 'برق' },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => onBrandingChange({ logoVariant: v.id })}
                  className={`flex flex-col items-center gap-1 rounded border p-1.5 text-[10px] transition-colors disabled:opacity-40 ${
                    branding.logoVariant === v.id
                      ? 'border-[#00d9a3]/60 bg-[#00d9a3]/15 text-[#00d9a3]'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <NovfoxLogo variant={v.id} size={16} />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Security & Change Password */}
      <div className="mb-3 border-b border-zinc-800/70 pb-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-300">
          <KeyRound size={13} className="text-[#00d9a3]" />
          <span>تغيير كلمة المرور</span>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-2">
          <input
            type="password"
            value={curPass}
            onChange={(e) => setCurPass(e.target.value)}
            disabled={passLoading}
            placeholder="كلمة المرور الحالية"
            className="w-full rounded border border-zinc-800 bg-[#0a0a0a] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-[#00d9a3]/60 focus:outline-none"
          />
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            disabled={passLoading}
            placeholder="كلمة المرور الجديدة (4 أحرف أو أرقام)"
            className="w-full rounded border border-zinc-800 bg-[#0a0a0a] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-[#00d9a3]/60 focus:outline-none"
          />
          <input
            type="password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            disabled={passLoading}
            placeholder="تأكيد كلمة المرور الجديدة"
            className="w-full rounded border border-zinc-800 bg-[#0a0a0a] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-[#00d9a3]/60 focus:outline-none"
          />

          <div className="flex items-center justify-between pt-1">
            <button
              type="submit"
              disabled={passLoading || !curPass || !newPass}
              className="flex items-center gap-1 rounded bg-[#00d9a3] px-3 py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {passLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              تحديث كلمة المرور
            </button>

            {passMsg && (
              <span
                className={`flex items-center gap-1 text-[11px] font-medium ${
                  passMsg.type === 'ok' ? 'text-[#00d9a3]' : 'text-rose-400'
                }`}
              >
                {passMsg.type === 'ok' ? <Check size={12} /> : <AlertCircle size={12} />}
                {passMsg.text}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Section 3: Technical Scanner Settings */}
      <div className="divide-y divide-zinc-800/70">
        <Row label="عدد العملات الممسوحة">
          <div className="flex overflow-hidden rounded border border-zinc-800" dir="ltr">
            {[15, 30, 50].map((n) => (
              <button
                key={n}
                disabled={isLocked}
                onClick={() => onChange({ symbolCount: n })}
                className={`px-2.5 py-1 text-xs font-num transition-colors disabled:opacity-40 ${
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
            {(['1m', '3m', '5m'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                disabled={isLocked}
                onClick={() => onChange({ primaryTf: tf })}
                className={`px-3 py-1 text-xs font-num transition-colors disabled:opacity-40 ${
                  s.primaryTf === tf ? 'bg-[#00d9a3] font-bold text-black' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </Row>

        <Row label="حد الإشارة القوية">
          <Slider
            value={s.strongThreshold}
            min={60}
            max={90}
            step={5}
            disabled={isLocked}
            onChange={(v) => onChange({ strongThreshold: v })}
          />
        </Row>

        <Row label="حد الإشارة العادية">
          <Slider
            value={s.normalThreshold}
            min={40}
            max={70}
            step={5}
            disabled={isLocked}
            onChange={(v) => onChange({ normalThreshold: Math.min(v, s.strongThreshold - 5) })}
          />
        </Row>

        <Row label="الحد الأدنى للسيولة اليومية">
          <Slider
            value={s.minQuoteVolM}
            min={1}
            max={50}
            step={1}
            unit="M$"
            disabled={isLocked}
            onChange={(v) => onChange({ minQuoteVolM: v })}
          />
        </Row>

        <Row label="مضاعف انفجار الحجم">
          <Slider
            value={s.volSpikeX}
            min={1.5}
            max={5}
            step={0.5}
            unit="×"
            disabled={isLocked}
            onChange={(v) => onChange({ volSpikeX: v })}
          />
        </Row>

        <Row label="التهدئة بين تنبيهات العملة">
          <Slider
            value={s.cooldownMin}
            min={1}
            max={10}
            step={1}
            unit=" د"
            disabled={isLocked}
            onChange={(v) => onChange({ cooldownMin: v })}
          />
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
              disabled={isLocked}
              onClick={() =>
                onChange({
                  indicators: {
                    ...s.indicators,
                    [ind.key]: !enabled,
                  },
                })
              }
              className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                enabled
                  ? 'border-[#00d9a3]/40 bg-[#00d9a3]/10 text-[#00d9a3]'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'
              }`}
            >
              <span>{ind.label}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-[#00d9a3]' : 'bg-zinc-600'}`} />
            </button>
          )
        })}
      </div>

      <h4 className="mt-3 border-t border-zinc-800/70 pt-3 text-[11px] font-semibold text-zinc-400">
        الويب هوك المخصص (JSON)
      </h4>
      <div className="py-2">
        <input
          dir="ltr"
          value={urlDraft}
          disabled={isLocked}
          onChange={(e) => setUrlDraft(e.target.value)}
          onBlur={saveUrl}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveUrl()
          }}
          placeholder="https://your-server.com/webhook"
          className="w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-2.5 py-1.5 font-num text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#00d9a3]/50 focus:outline-none disabled:opacity-40"
        />
      </div>
      <Row label="إرسال تلقائي عند كل إشارة">
        <Switch disabled={isLocked} on={s.webhookOn} onClick={() => onChange({ webhookOn: !s.webhookOn })} />
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
    </div>
  )
}
