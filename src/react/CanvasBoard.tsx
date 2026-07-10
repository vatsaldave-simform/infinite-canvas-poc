import { useEffect, useRef } from 'react'

/**
 * CanvasBoard — the React layer's single job in Milestone 0: own the <canvas>
 * DOM node and keep it sized to the viewport (HiDPI-crisp).
 *
 * No scene, no transforms, no drawing yet. Those live in core/ and arrive in
 * later milestones; this component will eventually wire pointer/wheel events
 * and hand them to the core engine.
 */
export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Size the backing store to physical pixels (DPR) while keeping the CSS
    // size at viewport dimensions, so the canvas is crisp on HiDPI displays.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const width = window.innerWidth
      const height = window.innerHeight

      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return <canvas ref={canvasRef} />
}
