import { useEffect, useRef, useState } from 'react'

interface Props {
  data: number[]
  vwap?: number[]
  width?: number
  height?: number
  positive: boolean
  responsive?: boolean
}

const MINT = '#00d9a3'
const RED = '#ff4d4d'
const VWAP_COLOR = 'rgba(156,163,175,0.75)'

export function Sparkline({ data, vwap, width = 110, height = 34, positive, responsive = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [computedWidth, setComputedWidth] = useState<number>(width)

  useEffect(() => {
    if (!responsive || !containerRef.current) return
    const el = containerRef.current
    const update = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setComputedWidth(Math.floor(w))
    }
    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [responsive])

  const renderWidth = responsive ? computedWidth : width

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length < 2 || renderWidth <= 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = renderWidth * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, renderWidth, height)

    const all = vwap && vwap.length === data.length ? [...data, ...vwap] : data
    const min = Math.min(...all)
    const max = Math.max(...all)
    const span = max - min || 1
    const x = (i: number) => (i / (data.length - 1)) * (renderWidth - 2) + 1
    const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6)

    if (vwap && vwap.length === data.length) {
      ctx.beginPath()
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = VWAP_COLOR
      ctx.lineWidth = 1
      vwap.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))))
      ctx.stroke()
      ctx.setLineDash([])
    }

    const color = positive ? MINT : RED
    // area fill
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, positive ? 'rgba(0,217,163,0.22)' : 'rgba(255,77,77,0.18)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.beginPath()
    ctx.moveTo(x(0), height)
    data.forEach((v, i) => ctx.lineTo(x(i), y(v)))
    ctx.lineTo(x(data.length - 1), height)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // line
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.lineJoin = 'round'
    data.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))))
    ctx.stroke()

    // last point
    ctx.beginPath()
    ctx.arc(x(data.length - 1), y(data[data.length - 1]), 2.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }, [data, vwap, renderWidth, height, positive])

  if (responsive) {
    return (
      <div ref={containerRef} className="w-full overflow-hidden" dir="ltr">
        <canvas
          ref={canvasRef}
          style={{ width: computedWidth > 0 ? `${computedWidth}px` : '100%', height: `${height}px` }}
          className="block"
        />
      </div>
    )
  }

  return <canvas ref={canvasRef} style={{ width, height }} className="block" dir="ltr" />
}
