import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import ZoomManualJoin from '../components/ZoomManualJoin'
import { createCheckin, getCheckinWindowConfig, type CheckinWindowConfig } from '../api'
import { classifySession, formatClockInTz } from '../checkinWindow'
import { useI18n } from '../i18n'

const zoomUrl =
  (import.meta.env.VITE_ZOOM_MEETING_URL as string | undefined) ??
  'https://zoom.us/join'

const displayTz = (import.meta.env.VITE_CHECKIN_TZ as string | undefined) ?? 'Asia/Tokyo'

export default function Join() {
  const { t } = useI18n()
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [outsideWindow, setOutsideWindow] = useState(false)
  const [lastCheckinStatus, setLastCheckinStatus] = useState<
    'morning' | 'night' | 'normal' | 'late' | 'leave' | 'outside' | null
  >(null)
  const [sessionFlash, setSessionFlash] = useState<string | null>(null)
  const [clockCfg, setClockCfg] = useState<CheckinWindowConfig | null>(null)
  const [tick, setTick] = useState(0)

  const canSubmit = useMemo(() => nickname.trim().length > 0 && !submitting, [
    nickname,
    submitting,
  ])

  useEffect(() => {
    getCheckinWindowConfig()
      .then(setClockCfg)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const clockTime = useMemo(() => formatClockInTz(new Date(), displayTz), [tick, displayTz])
  const activeSlot = useMemo(
    () => (clockCfg ? classifySession(new Date(), displayTz, clockCfg) : 'outside'),
    [tick, clockCfg, displayTz]
  )

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOutsideWindow(false)
    setSessionFlash(null)
    setSubmitting(true)
    try {
      const result = await createCheckin(nickname.trim())
      setLastCheckinStatus(result.status)
      if (result.is_real) {
        setSessionFlash(
          t('home.checkinRecordedSession', { type: t(`home.status.${result.status}`) })
        )
        window.setTimeout(() => {
          window.location.assign(zoomUrl)
        }, 1400)
        return
      }

      setOutsideWindow(true)
      setSubmitting(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  async function onApplyLeave() {
    if (!nickname.trim()) return
    setError(null)
    setOutsideWindow(false)
    setSessionFlash(null)
    setSubmitting(true)
    try {
      const result = await createCheckin(nickname.trim(), 'leave')
      setLastCheckinStatus(result.status)
      setOutsideWindow(true)
      setSubmitting(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="titleRow">
          <h1 className="title">{t('join.title')}</h1>
          <span className="tagline">{t('join.tagline')}</span>
        </div>
        <div className="muted">
          <Link to="/">{t('common.back')}</Link>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <h2>{t('join.enterNickname')}</h2>
          {clockCfg ? (
            <div className="checkinClockBlock">
              <div className="checkinClockTime">{clockTime}</div>
              <div className="muted checkinClockTz">{displayTz}</div>
              <div className="muted checkinWindowLine">
                {t('home.morningWindow')} {clockCfg.morning_start}–{clockCfg.morning_end} ·{' '}
                {t('home.nightWindow')} {clockCfg.night_start}–{clockCfg.night_end}
              </div>
              <div className={`checkinNowSlot checkinNowSlot-${activeSlot}`}>
                {t('home.nowInSession')}: {t(`home.status.${activeSlot}`)}
              </div>
            </div>
          ) : null}
          {sessionFlash ? (
            <p className="checkinSessionFlash" role="status">
              {sessionFlash}
            </p>
          ) : null}
          <form onSubmit={onSubmit} className="row">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('join.nicknamePlaceholder')}
              autoFocus
            />
            <button type="submit" disabled={!canSubmit}>
              {submitting ? t('join.joining') : t('join.joinZoom')}
            </button>
            <button type="button" className="secondary" disabled={!canSubmit} onClick={onApplyLeave}>
              {t('join.applyLeave')}
            </button>
          </form>
          <ZoomManualJoin />
          {error ? <p className="error">{error}</p> : null}
          {outsideWindow ? (
            <div className="notice">
              <div className="noticeTitle">{t('join.quickHeadsUp')}</div>
              <div className="muted">
                {lastCheckinStatus === 'leave' ? t('join.leaveSubmittedMsg') : t('join.outsideWindowMsg')}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" onClick={() => window.location.assign(zoomUrl)}>
                  {t('join.continueZoom')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setOutsideWindow(false)}
                >
                  {t('join.editNickname')}
                </button>
              </div>
            </div>
          ) : null}
          <p className="muted" style={{ marginTop: 10 }}>
            {t('join.redirectHint')}
          </p>
        </section>
      </main>
    </div>
  )
}
