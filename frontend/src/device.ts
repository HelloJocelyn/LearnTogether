/** True for iPhone / iPod / iPad (in Safari or installed PWA). Desktop Mac excluded. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Installed web app from home screen (iOS legacy) or display-mode standalone / fullscreen. */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  const mm = window.matchMedia?.bind(window) ?? null
  if (!mm) return false
  return (
    mm('(display-mode: standalone)').matches ||
    mm('(display-mode: fullscreen)').matches ||
    mm('(display-mode: minimal-ui)').matches
  )
}
