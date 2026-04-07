import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  apiBaseUrl,
  createCheckin,
  createMember,
  getDailyHero,
  listCheckins,
  listMembers,
  type CheckIn,
  type DailyHero,
  type Member,
} from '../api'
import { useI18n } from '../i18n'

const zoomUrl =
  (import.meta.env.VITE_ZOOM_MEETING_URL as string | undefined) ??
  'https://zoom.us/join'

const displayTz = (import.meta.env.VITE_CHECKIN_TZ as string | undefined) ?? 'Asia/Tokyo'

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

function resolveHeroImageSrc(hero: DailyHero | null): string {
  const raw = hero?.image_url?.trim()
  if (!raw) return '/cat.png'
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const prefix = apiBaseUrl()
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return prefix ? `${prefix}${path}` : path
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
  const [dailyHero, setDailyHero] = useState<DailyHero | null>(null)
  const [heroImgFailed, setHeroImgFailed] = useState(false)
  const memberFormatHint = 'nickname role goal'
  const selectedName =
    typeof selectedMemberId === 'number'
      ? members.find((m) => m.id === selectedMemberId)?.name ?? ''
      : ''
  const canJoin = !joining && (selectedName.trim().length > 0 || nickname.trim().length > 0)
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

    getDailyHero()
      .then(setDailyHero)
      .catch((e: unknown) => console.error(e))
  }, [])

  useEffect(() => {
    setHeroImgFailed(false)
  }, [dailyHero?.image_url])

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
              <div className="keepUpHeroVisual">
                <img
                  src={resolveHeroImageSrc(dailyHero)}
                  alt={dailyHero?.image_url ? t('home.dailyHeroAlt') : t('home.studyCatAlt')}
                  className={
                    dailyHero?.image_url && !heroImgFailed ? 'keepUpHeroImg' : 'keepUpCat'
                  }
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    if (el.src.includes('/cat.png')) {
                      el.style.display = 'none'
                      return
                    }
                    setHeroImgFailed(true)
                    el.src = '/cat.png'
                    el.alt = t('home.studyCatAlt')
                    el.className = 'keepUpCat'
                  }}
                />
                {dailyHero?.image_url && !heroImgFailed && (dailyHero.title || dailyHero.subtitle) ? (
                  <div className="keepUpHeroOverlay">
                    {dailyHero.title ? <div className="keepUpHeroTitle">{dailyHero.title}</div> : null}
                    {dailyHero.subtitle ? (
                      <div className="keepUpHeroSubtitle">{dailyHero.subtitle}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
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

      </main>
    </div>
  )
}

