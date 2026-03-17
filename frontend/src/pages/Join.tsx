import { type FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { createCheckin } from '../api'

const zoomUrl =
  (import.meta.env.VITE_ZOOM_MEETING_URL as string | undefined) ??
  'https://zoom.us/join'

export default function Join() {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [outsideWindow, setOutsideWindow] = useState(false)

  const canSubmit = useMemo(() => nickname.trim().length > 0 && !submitting, [
    nickname,
    submitting,
  ])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOutsideWindow(false)
    setSubmitting(true)
    try {
      const result = await createCheckin(nickname.trim())
      if (result.is_real) {
        window.location.assign(zoomUrl)
        return
      }

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
          <h1 className="title">Join</h1>
          <span className="tagline">今日も一緒に、一歩ずつ</span>
        </div>
        <div className="muted">
          <Link to="/">Back</Link>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <h2>Enter nickname</h2>
          <form onSubmit={onSubmit} className="row">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname"
              autoFocus
            />
            <button type="submit" disabled={!canSubmit}>
              {submitting ? 'Joining…' : 'Join Zoom'}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          {outsideWindow ? (
            <div className="notice">
              <div className="noticeTitle">Quick heads-up</div>
              <div className="muted">
                It’s currently outside the <strong>4:30–6:00</strong> check-in
                window, so this check-in <strong>won’t count</strong> as a real
                check-in.
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" onClick={() => window.location.assign(zoomUrl)}>
                  Continue to Zoom
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setOutsideWindow(false)}
                >
                  Edit nickname
                </button>
              </div>
            </div>
          ) : null}
          <p className="muted" style={{ marginTop: 10 }}>
            After saving your nickname, we’ll redirect you to Zoom.
          </p>
        </section>
      </main>
    </div>
  )
}

