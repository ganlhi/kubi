import { useSyncExternalStore } from 'react'

/** Below Tailwind's `lg` breakpoint: the phone and tablet layout. Wider screens keep the desktop one. */
const QUERY = '(max-width: 1023.98px)'

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export const useIsMobile = (): boolean => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
