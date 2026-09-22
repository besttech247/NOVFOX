import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyButton({
  text,
  title = 'نسخ اسم العملة',
  className = '',
  size = 10,
}: {
  text: string
  title?: string
  className?: string
  size?: number
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'تم النسخ!' : `${title} (${text})`}
      aria-label={`${title} (${text})`}
      className={`inline-flex shrink-0 items-center justify-center rounded p-0.5 transition-all active:scale-90 ${
        copied
          ? 'bg-[#00d9a3]/15 text-[#00d9a3]'
          : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
      } ${className}`}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  )
}
