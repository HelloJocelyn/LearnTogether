import { useEffect, useState } from 'react'

import { getZoomJoinHints, type ZoomJoinHints } from '../api'
import { useI18n } from '../i18n'

/** Digits only for clipboard; spaces for display like Zoom. */
export function formatZoomMeetingIdDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return raw.trim()
  if (digits.length <= 3) return digits
  if (digits.length >= 9) {
    const a = digits.slice(0, 3)
    const b = digits.slice(3, 6)
    const c = digits.slice(6)
    return [a, b, c].filter(Boolean).join(' ')
  }
  return digits.replace(/(.{3})/g, '$1 ').trim()
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

type ZoomManualJoinProps = {
  hideHeader?: boolean
  hideHint?: boolean
}

export default function ZoomManualJoin({ hideHeader = false, hideHint = false }: ZoomManualJoinProps) {
  const { t } = useI18n()
  const viteMeeting = (import.meta.env.VITE_ZOOM_MEETING_ID as string | undefined)?.trim() ?? ''
  const vitePass = (import.meta.env.VITE_ZOOM_PASSCODE as string | undefined)?.trim() ?? ''

  const [hints, setHints] = useState<ZoomJoinHints | null>(null)
  const [copied, setCopied] = useState<'id' | 'pass' | null>(null)

  useEffect(() => {
    let cancelled = false
    getZoomJoinHints()
      .then((data) => {
        if (!cancelled) setHints(data)
      })
      .catch(() => {
        if (!cancelled) setHints({ meeting_id: null, passcode: null, join_url: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const meetingIdRaw = (viteMeeting || hints?.meeting_id || '').trim()
  const passcodeRaw = (vitePass || hints?.passcode || '').trim()
  const ready = hints !== null
  const hasAnyVite = Boolean(viteMeeting || vitePass)
  const showLoading = !ready && !hasAnyVite
  const showEmpty = ready && !meetingIdRaw && !passcodeRaw

  const meetingIdCopy = meetingIdRaw.replace(/\D/g, '')

  async function onCopyId() {
    if (!meetingIdCopy) return
    const ok = await copyText(meetingIdCopy)
    if (ok) {
      setCopied('id')
      window.setTimeout(() => setCopied(null), 2000)
    }
  }

  async function onCopyPass() {
    if (!passcodeRaw) return
    const ok = await copyText(passcodeRaw)
    if (ok) {
      setCopied('pass')
      window.setTimeout(() => setCopied(null), 2000)
    }
  }

  return (
    <div className={`zoomManualJoin ${hideHeader && hideHint ? 'zoomManualJoinInline' : ''}`.trim()}>
      {!hideHeader ? <div className="zoomManualJoinTitle">{t('home.zoomManualTitle')}</div> : null}
      {!hideHint ? <p className="muted zoomManualJoinHint">{t('home.zoomManualHint')}</p> : null}
      {showLoading ? (
        <p className="muted zoomManualStatus">{t('home.zoomLoading')}</p>
      ) : null}
      {showEmpty ? (
        <p className="muted zoomManualStatus">{t('home.zoomNotConfigured')}</p>
      ) : null}
      {!showLoading && !showEmpty && meetingIdRaw ? (
        <div className="zoomManualRow">
          <div className="zoomManualLabel">{t('home.zoomMeetingId')}</div>
          <div className="zoomManualValueRow">
            <code className="zoomManualValue">{formatZoomMeetingIdDisplay(meetingIdRaw)}</code>
            <button
              type="button"
              className="secondary zoomManualCopy"
              onClick={onCopyId}
              disabled={!meetingIdCopy}
            >
              {copied === 'id' ? t('home.zoomCopied') : t('home.zoomCopy')}
            </button>
          </div>
        </div>
      ) : null}
      {!showLoading && !showEmpty && passcodeRaw ? (
        <div className="zoomManualRow">
          <div className="zoomManualLabel">{t('home.zoomPasscode')}</div>
          <div className="zoomManualValueRow">
            <code className="zoomManualValue">{passcodeRaw}</code>
            <button type="button" className="secondary zoomManualCopy" onClick={onCopyPass}>
              {copied === 'pass' ? t('home.zoomCopied') : t('home.zoomCopy')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
