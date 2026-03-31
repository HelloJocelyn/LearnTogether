import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { getCheckinWindowConfig, updateCheckinWindowConfig } from '../api'
import { useI18n } from '../i18n'

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

  useEffect(() => {
    getCheckinWindowConfig()
      .then((cfg) => {
        setStart(cfg.start)
        setEnd(cfg.end)
        setAppEnv(cfg.app_env)
        setSource(cfg.source)
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
      </main>
    </div>
  )
}
