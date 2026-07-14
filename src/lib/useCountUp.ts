import { useEffect, useRef, useState } from 'react'

// Animates towards `value` whenever it changes (ease-out cubic, ~120Hz-friendly).
export function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const displayRef = useRef(value)
  displayRef.current = display

  useEffect(() => {
    if (fromRef.current === value) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    const from = displayRef.current
    fromRef.current = value
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (value - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return display
}
