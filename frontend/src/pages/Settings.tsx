import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import {
  getCheckinWindowConfig,
  getDailyHeroSettings,
  getStatisticsSettings,
  getZoomJoinHints,
  listCheckins,
  updateCheckinWindowConfig,
  updateDailyHeroSettings,
  updateStatisticsSettings,
  updateZoomJoinHints,
  type CheckIn,
} from '../api'
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
  const [morningStart, setMorningStart] = useState('')
  const [morningEnd, setMorningEnd] = useState('')
  const [nightStart, setNightStart] = useState('')
  const [nightEnd, setNightEnd] = useState('')
  const [zoomMeetingId, setZoomMeetingId] = useState('')
  const [zoomPasscode, setZoomPasscode] = useState('')
  const [zoomJoinUrl, setZoomJoinUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [zoomSaving, setZoomSaving] = useState(false)
  const [windowEditing, setWindowEditing] = useState(false)
  const [zoomEditing, setZoomEditing] = useState(false)
  const [dailyHeroApiKey, setDailyHeroApiKey] = useState('')
  const [dailyHeroKeySet, setDailyHeroKeySet] = useState(false)
  const [dailyHeroEditing, setDailyHeroEditing] = useState(false)
  const [dailyHeroSaving, setDailyHeroSaving] = useState(false)
  const [dailyHeroSaved, setDailyHeroSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [zoomSaved, setZoomSaved] = useState<string | null>(null)
  const [outsideRows, setOutsideRows] = useState<CheckIn[]>([])
  const [weeklyNoCheckinThreshold, setWeeklyNoCheckinThreshold] = useState(2)
  const [statsEditing, setStatsEditing] = useState(false)
  const [statsSaving, setStatsSaving] = useState(false)
  const [statsSaved, setStatsSaved] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getCheckinWindowConfig(),
      getZoomJoinHints(),
      getDailyHeroSettings(),
      getStatisticsSettings(),
      listCheckins(500, false, { todayOnly: true }),
    ])
      .then(([cfg, zoom, dailyHero, stats, checkins]) => {
        setMorningStart(cfg.morning_start)
        setMorningEnd(cfg.morning_end)
        setNightStart(cfg.night_start)
        setNightEnd(cfg.night_end)
        setZoomMeetingId(zoom.meeting_id ?? '')
        setZoomPasscode(zoom.passcode ?? '')
        setZoomJoinUrl(zoom.join_url ?? '')
        setDailyHeroKeySet(dailyHero.daily_hero_openai_api_key_set)
        setDailyHeroApiKey('')
        setWeeklyNoCheckinThreshold(stats.weekly_no_checkin_threshold)
        setOutsideRows(checkins.filter((c) => !c.is_real))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function onSaveWindow() {
    setSaving(true)
    setError(null)
    setSaved(null)
    try {
      const cfg = await updateCheckinWindowConfig(
        morningStart,
        morningEnd,
        nightStart,
        nightEnd
      )
      setMorningStart(cfg.morning_start)
      setMorningEnd(cfg.morning_end)
      setNightStart(cfg.night_start)
      setNightEnd(cfg.night_end)
      setSaved(t('settings.saved'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function onSaveZoom() {
    setZoomSaving(true)
    setError(null)
    setZoomSaved(null)
    try {
      const savedZoom = await updateZoomJoinHints(zoomMeetingId, zoomPasscode, zoomJoinUrl)
      setZoomMeetingId(savedZoom.meeting_id ?? '')
      setZoomPasscode(savedZoom.passcode ?? '')
      setZoomJoinUrl(savedZoom.join_url ?? '')
      setZoomSaved(t('settings.zoomSaved'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setZoomSaving(false)
    }
  }

  async function onSaveDailyHero() {
    const trimmed = dailyHeroApiKey.trim()
    if (!trimmed) {
      setDailyHeroSaved(t('settings.dailyHeroNothingToSave'))
      return
    }
    setDailyHeroSaving(true)
    setError(null)
    setDailyHeroSaved(null)
    try {
      const saved = await updateDailyHeroSettings(trimmed)
      setDailyHeroKeySet(saved.daily_hero_openai_api_key_set)
      setDailyHeroApiKey('')
      setDailyHeroSaved(t('settings.dailyHeroSaved'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDailyHeroSaving(false)
    }
  }

  async function onClearDailyHeroKeyFromFile() {
    setDailyHeroSaving(true)
    setError(null)
    setDailyHeroSaved(null)
    try {
      const saved = await updateDailyHeroSettings('')
      setDailyHeroKeySet(saved.daily_hero_openai_api_key_set)
      setDailyHeroApiKey('')
      setDailyHeroSaved(t('settings.dailyHeroCleared'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDailyHeroSaving(false)
    }
  }

  async function onSaveStatistics() {
    setStatsSaving(true)
    setError(null)
    setStatsSaved(null)
    try {
      const saved = await updateStatisticsSettings(weeklyNoCheckinThreshold)
      setWeeklyNoCheckinThreshold(saved.weekly_no_checkin_threshold)
      setStatsSaved(t('settings.statisticsSaved'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStatsSaving(false)
    }
  }

  return (
    <div className="page">
      <main className="main settingsMain">
        <section className="card settingsCard settingsPrimaryCard">
          <div className="rowTop">
            <h2 style={{ marginBottom: 0 }}>{t('settings.title')}</h2>
            <button
              type="button"
              className="secondary"
              disabled={loading || saving}
              onClick={async () => {
                if (!windowEditing) {
                  setWindowEditing(true)
                  return
                }
                await onSaveWindow()
                setWindowEditing(false)
              }}
            >
              {saving ? t('settings.saving') : windowEditing ? t('settings.saveWindow') : t('settings.edit')}
            </button>
          </div>
          {loading ? <p className="muted">{t('settings.loadingConfig')}</p> : null}
          {!loading ? (
            <form className="quickJoinForm">
              <div className="settingsTimePairRow">
                <label className="label">
                  {t('settings.morningStart')}
                  <input
                    type="time"
                    value={morningStart}
                    onChange={(e) => setMorningStart(e.target.value)}
                    disabled={!windowEditing}
                    required
                  />
                </label>
                <label className="label">
                  {t('settings.morningEnd')}
                  <input
                    type="time"
                    value={morningEnd}
                    onChange={(e) => setMorningEnd(e.target.value)}
                    disabled={!windowEditing}
                    required
                  />
                </label>
              </div>
              <div className="settingsTimePairRow">
                <label className="label">
                  {t('settings.nightStart')}
                  <input
                    type="time"
                    value={nightStart}
                    onChange={(e) => setNightStart(e.target.value)}
                    disabled={!windowEditing}
                    required
                  />
                </label>
                <label className="label">
                  {t('settings.nightEnd')}
                  <input
                    type="time"
                    value={nightEnd}
                    onChange={(e) => setNightEnd(e.target.value)}
                    disabled={!windowEditing}
                    required
                  />
                </label>
              </div>
            </form>
          ) : null}
          {saved ? <p className="muted">{saved}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="card settingsCard settingsPrimaryCard">
          <div className="rowTop">
            <h3 style={{ margin: 0 }}>{t('settings.zoomTitle')}</h3>
            <button
              type="button"
              className="secondary"
              disabled={loading || zoomSaving}
              onClick={async () => {
                if (!zoomEditing) {
                  setZoomEditing(true)
                  return
                }
                await onSaveZoom()
                setZoomEditing(false)
              }}
            >
              {zoomSaving ? t('settings.saving') : zoomEditing ? t('settings.zoomSave') : t('settings.edit')}
            </button>
          </div>
          {!loading ? (
            <form className="quickJoinForm">
              <label className="label">
                {t('settings.zoomMeetingId')}
                <input
                  type="text"
                  value={zoomMeetingId}
                  onChange={(e) => setZoomMeetingId(e.target.value)}
                  disabled={!zoomEditing}
                  placeholder="12345678901"
                />
              </label>
              <label className="label">
                {t('settings.zoomPasscode')}
                <input
                  type="text"
                  value={zoomPasscode}
                  onChange={(e) => setZoomPasscode(e.target.value)}
                  disabled={!zoomEditing}
                  placeholder="passcode"
                />
              </label>
              <label className="label">
                {t('settings.zoomJoinUrl')}
                <input
                  type="url"
                  value={zoomJoinUrl}
                  onChange={(e) => setZoomJoinUrl(e.target.value)}
                  disabled={!zoomEditing}
                  placeholder="https://zoom.us/j/12345678901?pwd=..."
                />
              </label>
            </form>
          ) : null}
          {zoomSaved ? <p className="muted">{zoomSaved}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="card settingsCard settingsPrimaryCard">
          <div className="rowTop">
            <h3 style={{ margin: 0 }}>{t('settings.dailyHeroTitle')}</h3>
            <button
              type="button"
              className="secondary"
              disabled={loading || dailyHeroSaving}
              onClick={async () => {
                if (!dailyHeroEditing) {
                  setDailyHeroEditing(true)
                  return
                }
                await onSaveDailyHero()
                setDailyHeroEditing(false)
              }}
            >
              {dailyHeroSaving ? t('settings.saving') : dailyHeroEditing ? t('settings.dailyHeroSave') : t('settings.edit')}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            {t('settings.dailyHeroHint')}
          </p>
          {!loading ? (
            <form className="quickJoinForm">
              <label className="label">
                {t('settings.dailyHeroApiKey')}
                <input
                  type="password"
                  autoComplete="off"
                  value={dailyHeroApiKey}
                  onChange={(e) => setDailyHeroApiKey(e.target.value)}
                  disabled={!dailyHeroEditing}
                  placeholder={
                    dailyHeroKeySet ? t('settings.dailyHeroPlaceholderSet') : t('settings.dailyHeroPlaceholderEmpty')
                  }
                />
              </label>
              {dailyHeroEditing ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={dailyHeroSaving}
                  onClick={() => void onClearDailyHeroKeyFromFile()}
                >
                  {t('settings.dailyHeroClearFromFile')}
                </button>
              ) : null}
            </form>
          ) : null}
          {dailyHeroSaved ? <p className="muted">{dailyHeroSaved}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="card settingsCard settingsPrimaryCard">
          <div className="rowTop">
            <h3 style={{ margin: 0 }}>{t('settings.statisticsTitle')}</h3>
            <button
              type="button"
              className="secondary"
              disabled={loading || statsSaving}
              onClick={async () => {
                if (!statsEditing) {
                  setStatsEditing(true)
                  return
                }
                await onSaveStatistics()
                setStatsEditing(false)
              }}
            >
              {statsSaving ? t('settings.saving') : statsEditing ? t('settings.statisticsSave') : t('settings.edit')}
            </button>
          </div>
          {!loading ? (
            <form className="quickJoinForm">
              <label className="label">
                <span className="muted">0–7</span>
                <input
                  type="number"
                  min={0}
                  max={7}
                  step={1}
                  value={weeklyNoCheckinThreshold}
                  onChange={(e) => setWeeklyNoCheckinThreshold(Number(e.target.value))}
                  disabled={!statsEditing}
                  aria-label={t('settings.statisticsTitle')}
                />
              </label>
            </form>
          ) : null}
          {statsSaved ? <p className="muted">{statsSaved}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <details className="card settingsCard" open={false}>
          <summary className="shareSummary">
            <span>{t('settings.shareTitle')}</span>
            <span className="muted">{t('settings.collapsed')}</span>
          </summary>
          <div className="shareBody">
            <p className="muted">{t('settings.shareDesc')}</p>
            <div className="qrWrap">
              <QRCodeCanvas value={joinUrl} size={160} includeMargin />
            </div>
            <p className="muted">
              {t('settings.link')} <a href="/join">{joinUrl}</a>
            </p>
          </div>
        </details>

        {outsideRows.length > 0 ? (
          <details className="card settingsCard settingsOutsideCard" open={false}>
            <summary className="daySummary outsideLogSummary">
              <span className="dayTitle">{t('home.outsideWindowLog')}</span>
              <span className="dayCount muted">
                {t('home.outsideCheckinsCount', { count: outsideRows.length })}
              </span>
            </summary>
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
                          <span className={`pill statusPill statusPill-${c.status}`}>
                            {t(`home.status.${c.status}`)}
                          </span>
                        </div>
                        <div className="muted">{formatDateTime(c.created_at)}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </details>
        ) : null}
      </main>
    </div>
  )
}
