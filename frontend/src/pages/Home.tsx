import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  createCheckin,
  createMember,
  listCheckins,
  listMembers,
  type CheckIn,
  type Member,
} from '../api'
import { useI18n } from '../i18n'

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

function splitMemberLabel(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 3) {
    return {
      title: parts[0]!,
      subtitle: `${parts[1]!} ${parts.slice(2).join(' ')}`.trim(),
    }
  }
  return { title: name.trim(), subtitle: '' }
}

export default function Home() {
  const { t } = useI18n()
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<number | ''>('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [outsideWindow, setOutsideWindow] = useState(false)
  const memberFormatHint = 'nickname role goal'
  const selectedName =
    typeof selectedMemberId === 'number'
      ? members.find((m) => m.id === selectedMemberId)?.name ?? ''
      : ''
  const canJoin = !joining && (selectedName.trim().length > 0 || nickname.trim().length > 0)
  const todayKey = useMemo(() => toLocalDateKey(new Date().toISOString()), [])
  const currentZoneDate = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: displayTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    []
  )
  const serverTodayKey = useMemo(() => {
    if (checkins.length === 0) return todayKey
    return toLocalDateKey(checkins[0]!.created_at)
  }, [checkins, todayKey])
  const todayJoined = useMemo(() => {
    const names = new Set(checkins.map((c) => c.nickname.trim()))
    return names.size
  }, [checkins])

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
    if (!selectedName) {
      const parts = fallback.split(/\s+/).filter(Boolean)
      if (parts.length !== 3) {
        setJoinError(t('home.nameFormatError', { format: memberFormatHint }))
        return
      }
    }

    setJoinError(null)
    setOutsideWindow(false)
    setJoining(true)
    try {
      if (!selectedName) {
        const normalized = fallback.toLowerCase()
        const exists = members.some((m) => m.name.trim().toLowerCase() === normalized)
        if (!exists) {
          const member = await createMember(fallback)
          setMembers((prev) => {
            const alreadyInList = prev.some((m) => m.id === member.id)
            if (alreadyInList) return prev
            return [...prev, member].sort((a, b) => a.name.localeCompare(b.name))
          })
        }
      }

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
    return [...checkins].sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1))
  }, [checkins])

  const todaysOutside = useMemo(() => {
    return todaysJoins.filter((c) => !c.is_real)
  }, [todaysJoins])

  return (
    <div className="page">
      <main className="main">
        <div className="topPanel">
          <section className="card quickJoinSquare">
            <h2>🗓️ {t('home.dailyCheckin')}</h2>
            <form onSubmit={onQuickJoin} className="quickJoinForm">
              <div className="muted">{t('home.enterName')}</div>
              <div className="muted">{t('home.requiredFormat', { format: memberFormatHint })}</div>
              <select
                value={selectedMemberId}
                onChange={(e) =>
                  setSelectedMemberId(e.target.value === '' ? '' : Number(e.target.value))
                }
              >
                <option value="">
                  {members.length > 0 ? t('home.chooseSaved') : t('home.noSaved')}
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
                  placeholder={t('home.inputPlaceholder')}
                />
              </div>
              <button type="submit" disabled={!canJoin} className="checkinCta">
                {joining ? t('home.joining') : t('home.joinZoom')}
              </button>
            </form>
            {joinError ? <p className="error">{joinError}</p> : null}
            {outsideWindow ? (
              <div className="notice">
                <div className="noticeTitle">{t('home.quickHeadsUp')}</div>
                <div className="muted">{t('home.outsideWindowMsg')}</div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button type="button" onClick={() => window.location.assign(zoomUrl)}>
                    {t('home.continueZoom')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setOutsideWindow(false)}
                  >
                    {t('home.stayHere')}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="card keepUpCard">
            <div className="keepUpInner">
              <div>
                <h2>🐱 {t('home.keepItUp')}</h2>
                <div className="muted">{t('home.todayJoinedMembers', { count: todayJoined })}</div>
                <div className="muted">{t('home.dateWithTz', { tz: displayTz, date: currentZoneDate })}</div>
              </div>
              <img
                src="/cat.png"
                alt={t('home.studyCatAlt')}
                className="keepUpCat"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          </section>
        </div>

        <section className="card">
          <div className="rowTop">
            <h2 style={{ marginBottom: 0 }}>{t('home.todaysJoins')}</h2>
            <span className="muted">{t('home.joinsCount', { count: todaysJoins.length })}</span>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <ul className="list dayList joinsGrid" style={{ marginTop: 12 }}>
            {todaysJoins.length === 0 ? (
              <li className="emptyRow muted">{t('home.noCheckinsToday')}</li>
            ) : (
              todaysJoins.map((c) => {
                const av = avatarFor(c.nickname)
                const meta = splitMemberLabel(c.nickname)
                return (
                  <li key={c.id} className="rowItem joinTile">
                    <span className="avatar" style={{ background: av.bg }} aria-hidden="true">
                      {av.initials}
                    </span>
                    <div className="rowText">
                      <div className="rowTop">
                        <strong>{meta.title}</strong>
                      </div>
                      {meta.subtitle ? <div className="muted">{meta.subtitle}</div> : null}
                    </div>
                    <span className="joinArrow" aria-hidden="true">
                      ›
                    </span>
                  </li>
                )
              })
            )}
          </ul>
        </section>

        {todaysOutside.length > 0 ? (
          <section className="card">
            <div className="daySummary outsideLogSummary" style={{ cursor: 'default' }}>
              <span className="dayTitle">{t('home.outsideWindowLog')}</span>
              <span className="dayCount muted">
                {t('home.outsideCheckinsCount', { count: todaysOutside.length })}
              </span>
            </div>

            <div className="history outsideLogBody" style={{ marginTop: 10 }}>
              <div className="day" style={{ background: 'transparent' }}>
                <div className="daySummary" style={{ cursor: 'default' }}>
                  <span className="dayTitle">{serverTodayKey}</span>
                  <span className="dayCount muted">{t('home.outsideShortCount', { count: todaysOutside.length })}</span>
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
                              {t('home.outsideWindowBadge')}
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

