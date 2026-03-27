import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import { createCheckin, listCheckins, type CheckIn } from '../api'
import CheckinAnalytics from '../components/CheckinAnalytics'

const zoomUrl =
  (import.meta.env.VITE_ZOOM_MEETING_URL as string | undefined) ??
  'https://zoom.us/join'

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function toLocalDateKey(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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

export default function Home() {
  const joinUrl = useMemo(() => `${window.location.origin}/join`, [])
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [outsideWindow, setOutsideWindow] = useState(false)

  useEffect(() => {
    listCheckins(200, false)
      .then(setCheckins)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function refresh() {
    const data = await listCheckins(200, false)
    setCheckins(data)
  }

  async function onQuickJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = nickname.trim()
    if (!name) return

    setJoinError(null)
    setOutsideWindow(false)
    setJoining(true)
    try {
      const result = await createCheckin(name)
      await refresh()

      if (result.is_real) {
        window.location.assign(zoomUrl)
        return
      }

      setOutsideWindow(true)
      setJoining(false)
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : String(err))
      setJoining(false)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, CheckIn[]>()
    for (const c of checkins) {
      const key = toLocalDateKey(c.created_at)
      const arr = map.get(key)
      if (arr) arr.push(c)
      else map.set(key, [c])
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => (a === b ? 0 : a < b ? 1 : -1)) // newest date first
      .map(([dateKey, items]) => ({
        dateKey,
        items: items.sort((x, y) => (x.id === y.id ? 0 : x.id > y.id ? -1 : 1)),
      }))
  }, [checkins])

  const outsideGrouped = useMemo(() => {
    return grouped
      .map(({ dateKey, items }) => ({
        dateKey,
        items: items.filter((x) => !x.is_real),
      }))
      .filter(({ items }) => items.length > 0)
  }, [grouped])

  return (
    <div className="page">
      <header className="header">
        <div className="titleRow">
          <h1 className="title">LearnTogether</h1>
          <span className="tagline">今日も一緒に、一歩ずつ</span>
        </div>
        <div className="muted">Join & learn together</div>
      </header>

      <main className="main">
        <section className="card">
          <h2>Quick Join</h2>
          <p className="muted">
            Joining from a laptop? Enter your nickname here and jump straight to Zoom.
          </p>
          <form onSubmit={onQuickJoin} className="row">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname"
            />
            <button type="submit" disabled={joining || nickname.trim().length === 0}>
              {joining ? 'Joining…' : 'Join Zoom'}
            </button>
          </form>
          {joinError ? <p className="error">{joinError}</p> : null}
          {outsideWindow ? (
            <div className="notice">
              <div className="noticeTitle">Quick heads-up</div>
              <div className="muted">
                It’s currently outside the <strong>4:30–6:00</strong> check-in window,
                so this check-in <strong>won’t count</strong> as a real check-in.
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
                  Stay here
                </button>
              </div>
            </div>
          ) : null}
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

        <section className="card">
          <h2>Historical check-ins</h2>
          {error ? <p className="error">{error}</p> : null}
          {grouped.length === 0 ? (
            <p className="muted">No check-ins yet.</p>
          ) : (
            <div className="history">
              {grouped.map(({ dateKey, items }) => {
                const real = items.filter((x) => x.is_real)
                return (
                  <details key={dateKey} className="day" open={false}>
                    <summary className="daySummary">
                      <span className="dayTitle">{dateKey}</span>
                      <span className="dayCount muted">
                        {real.length} {real.length === 1 ? 'real check-in' : 'real check-ins'}
                      </span>
                    </summary>

                    <ul className="list dayList">
                      {real.length === 0 ? (
                        <li className="muted emptyRow">No real check-ins.</li>
                      ) : (
                        real.map((c) => {
                          const av = avatarFor(c.nickname)
                          return (
                            <li key={c.id} className="rowItem">
                              <span
                                className="avatar"
                                style={{ background: av.bg }}
                                aria-hidden="true"
                              >
                                {av.initials}
                              </span>
                              <div className="rowText">
                                <div className="rowTop">
                                  <strong>{c.nickname}</strong>
                                  <span className="pill real">Real</span>
                                </div>
                                <div className="muted">{formatDateTime(c.created_at)}</div>
                              </div>
                            </li>
                          )
                        })
                      )}
                    </ul>
                  </details>
                )
              })}
            </div>
          )}
        </section>

        <section className="card">
          <CheckinAnalytics />
        </section>

        {outsideGrouped.length > 0 ? (
          <details className="card" open={false}>
            <summary className="daySummary outsideLogSummary" style={{ cursor: 'pointer' }}>
              <span className="dayTitle">Outside window log</span>
              <span className="dayCount muted">
                {outsideGrouped.reduce((acc, g) => acc + g.items.length, 0)} outside check-ins
              </span>
            </summary>

            <div className="history outsideLogBody" style={{ marginTop: 10 }}>
              {outsideGrouped.map(({ dateKey, items }) => (
                <div key={dateKey} className="day" style={{ background: 'transparent' }}>
                  <div className="daySummary" style={{ cursor: 'default' }}>
                    <span className="dayTitle">{dateKey}</span>
                    <span className="dayCount muted">{items.length} outside</span>
                  </div>
                  <ul className="list dayList outside" style={{ marginTop: 0 }}>
                    {items.map((c) => {
                      const av = avatarFor(c.nickname)
                      return (
                        <li key={c.id} className="rowItem outsideRow">
                          <span className="avatar avatarGrey" aria-hidden="true">
                            {av.initials}
                          </span>
                          <div className="rowText">
                            <div className="rowTop">
                              <strong>{c.nickname}</strong>
                              <span className="pill outsidePill">
                                Outside 4:30–6:00
                              </span>
                            </div>
                            <div className="muted">{formatDateTime(c.created_at)}</div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </main>
    </div>
  )
}

