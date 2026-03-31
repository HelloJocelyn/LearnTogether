import { type FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { createCheckin } from '../api'
import { useI18n } from '../i18n'

const zoomUrl =
  (import.meta.env.VITE_ZOOM_MEETING_URL as string | undefined) ??
  'https://zoom.us/join'

export default function Join() {
  const { t } = useI18n()
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
          </form>
          {error ? <p className="error">{error}</p> : null}
          {outsideWindow ? (
            <div className="notice">
              <div className="noticeTitle">{t('join.quickHeadsUp')}</div>
              <div className="muted">{t('join.outsideWindowMsg')}</div>
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

