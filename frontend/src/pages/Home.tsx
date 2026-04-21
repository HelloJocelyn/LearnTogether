import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  apiBaseUrl,
  createCheckin,
  createMember,
  getCheckinWindowConfig,
  getDailyHero,
  listCheckins,
  listMembers,
  type CheckIn,
  type CheckinWindowConfig,
  type DailyHero,
  type Member,
} from '../api'
import ZoomManualJoin from '../components/ZoomManualJoin'
import { classifySession, formatClockInTz } from '../checkinWindow'
import { useI18n } from '../i18n'
import { avatarFor } from '../avatar'

const zoomUrl =
  (import.meta.env.VITE_ZOOM_MEETING_URL as string | undefined) ??
  'https://zoom.us/join'

const displayTz = (import.meta.env.VITE_CHECKIN_TZ as string | undefined) ?? 'Asia/Tokyo'

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

function memberDisplayName(m: Member): string {
  return `${m.name} ${m.role} ${m.goal}`.trim()
}

function resolveHeroImageSrc(hero: DailyHero | null): string {
  const raw = hero?.image_url?.trim()
  if (!raw) return '/cat.png'
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const prefix = apiBaseUrl()
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return prefix ? `${prefix}${path}` : path
}

function splitEncourageLines(hero: DailyHero | null): string[] {
  const raw = `${hero?.subtitle ?? ''}`.trim()
  if (!raw) return []
  return raw
    .split(/\r?\n|[|｜]/)
    .map((s) => s.trim())
    .filter(Boolean)
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
  const [lastCheckinStatus, setLastCheckinStatus] = useState<CheckIn['status'] | null>(null)
  const [sessionFlash, setSessionFlash] = useState<string | null>(null)
  const [clockCfg, setClockCfg] = useState<CheckinWindowConfig | null>(null)
  const [tick, setTick] = useState(0)
  const [dailyHero, setDailyHero] = useState<DailyHero | null>(null)
  const [heroImgFailed, setHeroImgFailed] = useState(false)
  const memberFormatHint = 'nickname role goal'
  const selectedName =
    typeof selectedMemberId === 'number'
      ? (() => {
          const m = members.find((x) => x.id === selectedMemberId)
          return m ? memberDisplayName(m) : ''
        })()
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

    getCheckinWindowConfig()
      .then(setClockCfg)
      .catch((e: unknown) => console.error(e))
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const clockTime = useMemo(() => formatClockInTz(new Date(), displayTz), [tick, displayTz])
  const activeSlot = useMemo(
    () => (clockCfg ? classifySession(new Date(), displayTz, clockCfg) : 'outside'),
    [tick, clockCfg, displayTz]
  )

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
    setSessionFlash(null)
    setJoining(true)
    try {
      if (!selectedName) {
        const parts = fallback.split(/\s+/).filter(Boolean)
        const normalized = {
          name: parts[0] ?? '',
          role: parts[1] ?? '',
          goal: parts.slice(2).join(' '),
        }
        const exists = members.some(
          (m) =>
            m.name.trim().toLowerCase() === normalized.name.toLowerCase() &&
            m.role.trim().toLowerCase() === normalized.role.toLowerCase() &&
            m.goal.trim().toLowerCase() === normalized.goal.toLowerCase()
        )
        if (!exists) {
          const member = await createMember(normalized.name, normalized.role, normalized.goal)
          setMembers((prev) => {
            const alreadyInList = prev.some((m) => m.id === member.id)
            if (alreadyInList) return prev
            return [...prev, member].sort((a, b) =>
              memberDisplayName(a).localeCompare(memberDisplayName(b))
            )
          })
        }
      }

      const result = await createCheckin(name)
      await refresh()
      setLastCheckinStatus(result.status)

      if (result.is_real) {
        setSessionFlash(
          t('home.checkinRecordedSession', { type: t(`home.status.${result.status}`) })
        )
        window.setTimeout(() => {
          window.location.assign(zoomUrl)
        }, 1400)
        return
      }

      setOutsideWindow(true)
      setJoining(false)
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : String(err))
      setJoining(false)
    }
  }

  async function onApplyLeave() {
    const fallback = nickname.trim()
    const name = selectedName || fallback
    if (!name) return
    setJoinError(null)
    setOutsideWindow(false)
    setSessionFlash(null)
    setJoining(true)
    try {
      const result = await createCheckin(name, 'leave')
      await refresh()
      setLastCheckinStatus(result.status)
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
  const encourageLines = useMemo(() => splitEncourageLines(dailyHero), [dailyHero])

  return (
    <div className="page">
      <main className="main">
        <div className="topPanel">
          <section className="card quickJoinSquare">
            <h2>🗓️ {t('home.dailyCheckin')}</h2>
            {clockCfg ? (
              <div className="checkinClockBlock">
                <div className="checkinClockTime">{clockTime}</div>
                <div className="muted checkinClockTz">{displayTz}</div>
                <div className="muted checkinWindowLine">
                  {t('home.morningWindow')}{' '}
                  {clockCfg.morning_start}–{clockCfg.morning_end} · {t('home.nightWindow')}{' '}
                  {clockCfg.night_start}–{clockCfg.night_end}
                </div>
                <div className={`checkinNowSlot checkinNowSlot-${activeSlot}`}>
                  {t('home.nowInSession')}: {t(`home.status.${activeSlot}`)}
                </div>
              </div>
            ) : null}
            {sessionFlash ? (
              <p className="checkinSessionFlash" role="status">
                {sessionFlash}
              </p>
            ) : null}
            <form onSubmit={onQuickJoin} className="quickJoinForm">
              <div className="muted">{t('home.enterName')}</div>
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
                    {memberDisplayName(m)}
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
              <div className="checkinActionsRow">
                <button type="submit" disabled={!canJoin} className="checkinCta">
                  {joining ? t('home.joining') : t('home.joinZoom')}
                </button>
                <button type="button" className="secondary" disabled={!canJoin || joining} onClick={onApplyLeave}>
                  {t('home.applyLeave')}
                </button>
              </div>
            </form>
            <details className="zoomManualDetails">
              <summary className="zoomManualSummary">{t('home.zoomManualTitle')}</summary>
              <ZoomManualJoin hideHeader hideHint />
            </details>
            {joinError ? <p className="error">{joinError}</p> : null}
            {outsideWindow ? (
              <div className="notice">
                <div className="noticeTitle">{t('home.quickHeadsUp')}</div>
                <div className="muted">
                  {lastCheckinStatus === 'leave'
                    ? t('home.leaveSubmittedMsg')
                    : t('home.outsideWindowMsg')}
                </div>
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
              <div className="keepUpHeader">
                <h2>✨ {t('home.encourageTitle')}</h2>
                <div className="muted">{t('home.dateWithTz', { tz: displayTz, date: currentZoneDate })}</div>
              </div>
              <div className="keepUpHeroVisual">
                <img
                  src={resolveHeroImageSrc(dailyHero)}
                  alt={dailyHero?.image_url ? t('home.dailyHeroAlt') : t('home.studyCatAlt')}
                  className={
                    dailyHero?.image_url && !heroImgFailed ? 'keepUpHeroImg keepUpHeroImgTop' : 'keepUpCat'
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
              </div>
              <div className="keepUpSentencePanel">
                {dailyHero?.title ? <div className="keepUpHeroTitle">{dailyHero.title}</div> : null}
                {encourageLines.length > 0 ? (
                  <ul className="keepUpSentenceList">
                    {encourageLines.map((line, idx) => (
                      <li key={`${line}-${idx}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="muted keepUpFallbackText">{t('home.encourageFallback')}</div>
                )}
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
                        <span className={`pill statusPill statusPill-${c.status}`}>
                          {t(`home.status.${c.status}`)}
                        </span>
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

