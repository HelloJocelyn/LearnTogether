import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { getCheckinWindowConfig, updateCheckinWindowConfig } from '../api'

export default function Settings() {
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
      setSaved('Saved check-in window config.')
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
          <h2>Settings</h2>
          <p className="muted">Manage environment-aware check-in window config.</p>
          {loading ? <p className="muted">Loading check-in config…</p> : null}
          {!loading ? (
            <form onSubmit={onSaveWindow} className="quickJoinForm" style={{ marginTop: 12 }}>
              <div className="muted">Environment: {appEnv || 'local'}</div>
              <div className="muted">Source: {source || '-'}</div>
              <label className="label">
                Window start
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </label>
              <label className="label">
                Window end
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </label>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save check-in window'}
              </button>
            </form>
          ) : null}
          {saved ? <p className="muted">{saved}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <details className="card" open={false}>
          <summary className="shareSummary">
            <span>Share this site (QR)</span>
            <span className="muted">collapsed</span>
          </summary>
          <div className="shareBody">
            <p className="muted">
              This QR code is for you to share the join page with others.
            </p>
            <div className="qrWrap">
              <QRCodeCanvas value={joinUrl} size={220} includeMargin />
            </div>
            <p className="muted">
              Link: <a href="/join">{joinUrl}</a>
            </p>
          </div>
        </details>
      </main>
    </div>
  )
}
