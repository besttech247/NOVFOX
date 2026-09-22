import { Flame, Radar, Zap } from 'lucide-react'

export type LogoVariant = 'fox' | 'radar' | 'flame' | 'zap' | 'custom'

interface Props {
  variant?: LogoVariant
  customUrl?: string
  size?: number
  className?: string
}

export function NovfoxLogo({ variant = 'fox', customUrl, size = 24, className = '' }: Props) {
  if (variant === 'custom' && customUrl) {
    return (
      <img
        src={customUrl}
        alt="Logo"
        width={size}
        height={size}
        className={`rounded-md object-contain ${className}`}
      />
    )
  }

  if (variant === 'radar') {
    return <Radar size={size} className={className} />
  }

  if (variant === 'flame') {
    return <Flame size={size} className={className} />
  }

  if (variant === 'zap') {
    return <Zap size={size} className={className} />
  }

  // Default: Sleek Geometric Origami Fox Emblem
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="foxGrad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00ffc2" />
          <stop offset="50%" stopColor="#00d9a3" />
          <stop offset="100%" stopColor="#029e77" />
        </linearGradient>
        <linearGradient id="foxEarR" x1="16" y1="3" x2="29" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00ffc2" />
          <stop offset="100%" stopColor="#00b386" />
        </linearGradient>
        <linearGradient id="foxEarL" x1="16" y1="3" x2="3" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00d9a3" />
          <stop offset="100%" stopColor="#008f6b" />
        </linearGradient>
      </defs>

      {/* Left Outer Ear */}
      <polygon points="16,13 4,4 7,19" fill="url(#foxEarL)" opacity="0.9" />

      {/* Right Outer Ear */}
      <polygon points="16,13 28,4 25,19" fill="url(#foxEarR)" />

      {/* Forehead / Brow */}
      <polygon points="16,13 7,19 16,23 25,19" fill="#00d9a3" />

      {/* Left Snout */}
      <polygon points="16,23 7,19 16,30" fill="#00b386" />

      {/* Right Snout */}
      <polygon points="16,23 25,19 16,30" fill="url(#foxGrad)" />

      {/* Nose Tip */}
      <polygon points="15,29 17,29 16,31" fill="#0a0a0a" />

      {/* Left Eye */}
      <polygon points="11,18 14,19 12,20" fill="#ffffff" />

      {/* Right Eye */}
      <polygon points="21,18 18,19 20,20" fill="#ffffff" />
    </svg>
  )
}
