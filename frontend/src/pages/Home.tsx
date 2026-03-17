import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import { listCheckins, type CheckIn } from '../api'

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

  useEffect(() => {
    listCheckins(200)
      .then(setCheckins)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

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

  return (
    <div className="page">
      <header className="header">
        <h1>LearnTogether</h1>
        <div className="muted">Scan to join</div>
      </header>

      <main className="main">
        <section className="card">
          <h2>QR code</h2>
          <p className="muted">
            Scan this QR code to open the join page on your phone.
          </p>
          <div className="qrWrap">
            <QRCodeCanvas value={joinUrl} size={220} includeMargin />
          </div>
          <p className="muted">
            Or open: <a href="/join">{joinUrl}</a>
          </p>
        </section>

        <section className="card">
          <h2>Historical check-ins</h2>
          {error ? <p className="error">{error}</p> : null}
          {grouped.length === 0 ? (
            <p className="muted">No check-ins yet.</p>
          ) : (
            <div className="history">
              {grouped.map(({ dateKey, items }) => (
                <details key={dateKey} className="day" open={false}>
                  <summary className="daySummary">
                    <span className="dayTitle">{dateKey}</span>
                    <span className="dayCount muted">
                      {items.length} {items.length === 1 ? 'check-in' : 'check-ins'}
                    </span>
                  </summary>

                  <ul className="list dayList">
                    {items.map((c) => {
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
                            <strong>{c.nickname}</strong>
                            <div className="muted">{formatDateTime(c.created_at)}</div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

