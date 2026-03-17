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

  const canSubmit = useMemo(() => nickname.trim().length > 0 && !submitting, [
    nickname,
    submitting,
  ])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createCheckin(nickname.trim())
      window.location.assign(zoomUrl)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Join</h1>
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
          <p className="muted" style={{ marginTop: 10 }}>
            After saving your nickname, we’ll redirect you to Zoom.
          </p>
        </section>
      </main>
    </div>
  )
}

