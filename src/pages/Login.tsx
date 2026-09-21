import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Loader2, Lock, Radar } from 'lucide-react'

interface Props {
  onSuccess: () => void
}

export function Login({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.login(password)
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const sec = (err.payload as { retryAfterSec?: number } | undefined)?.retryAfterSec ?? 60
        setError(`محاولات كثيرة — انتظر ${sec} ثانية ثم أعد المحاولة`)
      } else if (err instanceof ApiError && err.status === 401) {
        setError('كلمة المرور غير صحيحة')
      } else {
        setError('تعذّر الاتصال بالسيرفر — أعد المحاولة')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 text-zinc-200">
      {/* subtle grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(#00d9a3 1px, transparent 1px), linear-gradient(90deg, #00d9a3 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 60% 50% at 50% 45%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 45%, black, transparent)',
        }}
      />

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-xl border border-zinc-800 bg-[#121214] p-6 shadow-2xl shadow-black/60"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00d9a3]/10 text-[#00d9a3]">
            <Radar size={22} />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-white">سكانر السكالبنغ</h1>
            <p className="mt-1 text-xs text-zinc-500">لوحة خاصة — سجّل الدخول للمتابعة</p>
          </div>
        </div>

        <label className="mb-1.5 block text-xs text-zinc-400" htmlFor="password">
          كلمة المرور
        </label>
        <div className="relative">
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900/70 py-2.5 pe-3 ps-9 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#00d9a3]/60 focus:ring-1 focus:ring-[#00d9a3]/30"
            placeholder="••••••••"
            dir="ltr"
          />
          <Lock size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-[#ff4d4d]/30 bg-[#ff4d4d]/[0.08] px-3 py-2 text-xs leading-relaxed text-[#ff4d4d]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#00d9a3] py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          دخول
        </button>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-zinc-600">
          جلسة الدخول تدوم 30 يوماً على هذا الجهاز
        </p>
      </form>
    </div>
  )
}
