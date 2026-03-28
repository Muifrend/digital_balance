import { useEffect } from 'react'

/** Calls `onEscape` whenever the Escape key is pressed globally. */
export function useEscapeKey(onEscape: () => void): void {
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onEscape])
}
