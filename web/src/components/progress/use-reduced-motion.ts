import { useEffect, useState } from 'react'

/**
 * Whether the viewer asked for reduced motion. Starts `false` (so SSR + first paint assume motion
 * is fine) and syncs to the media query on mount — chart draw-on animations read this to stay still
 * when the user prefers it.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}
