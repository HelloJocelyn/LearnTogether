import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { createCheckin, listCheckins, listMembers, type CheckIn, type Member } from '../api'

const zoomUrl =
  (import.meta.env.VITE_ZOOM_MEETING_URL as string | undefined) ??
  'https://zoom.us/join'

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

function toLocalDateKey(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: displayTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const yyyy = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const mm = parts.find((p) => p.type === 'month')?.value ?? '00'
  const dd = parts.find((p) => p.type === 'day')?.value ?? '00'
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
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<number | ''>('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [outsideWindow, setOutsideWindow] = useState(false)
  const selectedName =
    typeof selectedMemberId === 'number'
      ? members.find((m) => m.id === selectedMemberId)?.name ?? ''
      : ''
  const canJoin = !joining && (selectedName.trim().length > 0 || nickname.trim().length > 0)
  const todayKey = useMemo(
    () => toLocalDateKey(new Date().toISOString()),
    []
  )
  const todayJoined = useMemo(() => {
    const names = new Set(
      checkins.filter((c) => toLocalDateKey(c.created_at) === todayKey).map((c) => c.nickname.trim())
    )
    return names.size
  }, [checkins, todayKey])

  useEffect(() => {
    listCheckins(500, false, { todayOnly: true })
      .then(setCheckins)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    listMembers()
      .then(setMembers)
      .catch((e: unknown) => console.error(e))
  }, [])

  async function refresh() {
    const data = await listCheckins(500, false, { todayOnly: true })
    setCheckins(data)
  }

  async function onQuickJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fallback = nickname.trim()
    const name = selectedName || fallback
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

  const todaysJoins = useMemo(() => {
    return checkins
      .filter((c) => toLocalDateKey(c.created_at) === todayKey)
      .sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1))
  }, [checkins, todayKey])

  const todaysOutside = useMemo(() => {
    return todaysJoins.filter((c) => !c.is_real)
  }, [todaysJoins])

  return (
    <div className="page">
      <main className="main">
        <div className="topPanel">
          <section className="card quickJoinSquare">
            <h2>Daily Check-In</h2>
            <form onSubmit={onQuickJoin} className="quickJoinForm">
              <div className="muted">Enter your name to check in:</div>
              <select
                value={selectedMemberId}
                onChange={(e) =>
                  setSelectedMemberId(e.target.value === '' ? '' : Number(e.target.value))
                }
              >
                <option value="">
                  {members.length > 0 ? 'Choose saved name' : 'No saved names yet'}
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="inputEditRow">
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              <button type="submit" disabled={!canJoin} className="checkinCta">
                {joining ? 'Joining…' : 'Join Zoom'}
              </button>
            </form>
            {joinError ? <p className="error">{joinError}</p> : null}
            {outsideWindow ? (
              <div className="notice">
                <div className="noticeTitle">Quick heads-up</div>
                <div className="muted">
                  It’s currently outside the configured check-in window,
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

          <section className="card keepUpCard">
            <div className="keepUpInner">
              <div>
                <h2>Keep it up</h2>
                <div className="muted">Today Joined: {todayJoined} Members</div>
              </div>
              <img
                src="/cat.png"
                alt="Study cat"
                className="keepUpCat"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          </section>
        </div>

        <section className="card">
          <h2>Today's joins</h2>
          {error ? <p className="error">{error}</p> : null}
          {todaysJoins.length === 0 ? (
            <p className="muted">No check-ins yet.</p>
          ) : (
            <div className="history">
              <div className="day">
                <div className="daySummary" style={{ cursor: 'default' }}>
                  <span className="dayTitle">{todayKey}</span>
                  <span className="dayCount muted">
                    {todaysJoins.length} {todaysJoins.length === 1 ? 'join' : 'joins'}
                  </span>
                </div>

                <ul className="list dayList">
                  {todaysJoins.map((c) => {
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
                            <span className={`pill ${c.is_real ? 'real' : 'outsidePill'}`}>
                              {c.is_real ? 'Real' : 'Outside window'}
                            </span>
                          </div>
                          <div className="muted">{formatDateTime(c.created_at)}</div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
        </section>

        {todaysOutside.length > 0 ? (
          <section className="card">
            <div className="daySummary outsideLogSummary" style={{ cursor: 'default' }}>
              <span className="dayTitle">Outside window log</span>
              <span className="dayCount muted">
                {todaysOutside.length} outside check-ins
              </span>
            </div>

            <div className="history outsideLogBody" style={{ marginTop: 10 }}>
              <div className="day" style={{ background: 'transparent' }}>
                <div className="daySummary" style={{ cursor: 'default' }}>
                  <span className="dayTitle">{todayKey}</span>
                  <span className="dayCount muted">{todaysOutside.length} outside</span>
                </div>
                <ul className="list dayList outside" style={{ marginTop: 0 }}>
                  {todaysOutside.map((c) => {
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
                              Outside configured window
                            </span>
                          </div>
                          <div className="muted">{formatDateTime(c.created_at)}</div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

