import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { getCheckinWindowConfig, listCheckins, updateCheckinWindowConfig, type CheckIn } from '../api'
import { useI18n } from '../i18n'

const displayTz = (import.meta.env.VITE_CHECKIN_TZ as string | undefined) ?? 'Asia/Tokyo'

function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    timeZone: displayTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d)
}

function hashString(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

function avatarFor(nickname: string) {
  const trimmed = nickname.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const initials =
    parts.length === 0
      ? '?'
      : parts.length === 1
        ? parts[0]!.slice(0, 2).toUpperCase()
        : (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()

  const h = hashString(trimmed.toLowerCase())
  const hue = h % 360
  const bg = `hsl(${hue} 70% 40%)`
  return { initials, bg }
}

export default function Settings() {
  const { t } = useI18n()
  const joinUrl = useMemo(() => `${window.location.origin}/join`, [])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [appEnv, setAppEnv] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [outsideRows, setOutsideRows] = useState<CheckIn[]>([])

  useEffect(() => {
    Promise.all([getCheckinWindowConfig(), listCheckins(500, false, { todayOnly: true })])
      .then(([cfg, checkins]) => {
        setStart(cfg.start)
        setEnd(cfg.end)
        setAppEnv(cfg.app_env)
        setSource(cfg.source)
        setOutsideRows(checkins.filter((c) => !c.is_real))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function onSaveWindow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(null)
    try {
      const cfg = await updateCheckinWindowConfig(start, end)
      setStart(cfg.start)
      setEnd(cfg.end)
      setAppEnv(cfg.app_env)
      setSource(cfg.source)
      setSaved(t('settings.saved'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <main className="main">
        <section className="card">
          <h2>{t('settings.title')}</h2>
          <p className="muted">{t('settings.checkinConfigDesc')}</p>
          {loading ? <p className="muted">{t('settings.loadingConfig')}</p> : null}
          {!loading ? (
            <form onSubmit={onSaveWindow} className="quickJoinForm" style={{ marginTop: 12 }}>
              <div className="muted">{t('settings.environment', { value: appEnv || 'local' })}</div>
              <div className="muted">{t('settings.source', { value: source || '-' })}</div>
              <label className="label">
                {t('settings.windowStart')}
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </label>
              <label className="label">
                {t('settings.windowEnd')}
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </label>
              <button type="submit" disabled={saving}>
                {saving ? t('settings.saving') : t('settings.saveWindow')}
              </button>
            </form>
          ) : null}
          {saved ? <p className="muted">{saved}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <details className="card" open={false}>
          <summary className="shareSummary">
            <span>{t('settings.shareTitle')}</span>
            <span className="muted">{t('settings.collapsed')}</span>
          </summary>
          <div className="shareBody">
            <p className="muted">
              {t('settings.shareDesc')}
            </p>
            <div className="qrWrap">
              <QRCodeCanvas value={joinUrl} size={220} includeMargin />
            </div>
            <p className="muted">
              {t('settings.link')} <a href="/join">{joinUrl}</a>
            </p>
          </div>
        </details>

        {outsideRows.length > 0 ? (
          <section className="card">
            <div className="daySummary outsideLogSummary" style={{ cursor: 'default' }}>
              <span className="dayTitle">{t('home.outsideWindowLog')}</span>
              <span className="dayCount muted">
                {t('home.outsideCheckinsCount', { count: outsideRows.length })}
              </span>
            </div>
            <div className="history outsideLogBody" style={{ marginTop: 10 }}>
              <ul className="list dayList outside" style={{ marginTop: 0 }}>
                {outsideRows.map((c) => {
                  const av = avatarFor(c.nickname)
                  return (
                    <li key={c.id} className="rowItem outsideRow">
                      <span className="avatar avatarGrey" aria-hidden="true" style={{ background: av.bg }}>
                        {av.initials}
                      </span>
                      <div className="rowText">
                        <div className="rowTop">
                          <strong>{c.nickname}</strong>
                          <span className="pill outsidePill">{t('home.outsideWindowBadge')}</span>
                        </div>
                        <div className="muted">{formatDateTime(c.created_at)}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
