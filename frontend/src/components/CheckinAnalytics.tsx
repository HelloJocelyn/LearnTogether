import { useEffect, useMemo, useState } from 'react'

import { listBadges, listCheckins, type AchievementBadge, type CheckIn } from '../api'
import { useI18n } from '../i18n'

type Tab = 'daily' | 'monthly' | 'yearly'
type CheckinStatus = CheckIn['status']

const tzDefault = (import.meta.env.VITE_CHECKIN_TZ as string | undefined) ?? 'Asia/Tokyo'
const statusOrder: CheckinStatus[] = ['normal', 'late', 'leave', 'outside']

function pickDominantStatus(current: CheckinStatus | undefined, incoming: CheckinStatus): CheckinStatus {
  if (!current) return incoming
  const rank: Record<CheckinStatus, number> = {
    normal: 4,
    late: 3,
    leave: 2,
    outside: 1,
  }
  return rank[incoming] > rank[current] ? incoming : current
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dateKey(year: number, month1Based: number, day: number) {
  return `${year}-${pad2(month1Based)}-${pad2(day)}`
}

function parseDateKey(raw: string): { y: number; m: number; day: number } | null {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null
  if (m < 1 || m > 12 || day < 1 || day > 31) return null
  return { y, m, day }
}

function getTzYMDParts(d: Date, tz: string) {
  // en-CA ensures it returns YYYY-MM-DD with the given timezone.
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = dtf.format(d).split('-').map((x) => Number(x))
  const [y, m, day] = parts
  return { y, m, day }
}

function getCheckinYMD(c: CheckIn, tz: string) {
  if (c.checkin_date_local) {
    const parsed = parseDateKey(c.checkin_date_local)
    if (parsed) return parsed
  }
  return getTzYMDParts(new Date(c.created_at), tz)
}

function getMonthLabel(year: number, month1Based: number) {
  const d = new Date(Date.UTC(year, month1Based - 1, 1))
  return d.toLocaleString(undefined, { month: 'short' })
}

function avatarFor(nickname: string) {
  // Keep this in sync with Home.tsx avatarFor.
  const trimmed = nickname.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const initials =
    parts.length === 0
      ? '?'
      : parts.length === 1
        ? parts[0]!.slice(0, 2).toUpperCase()
        : (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()

  let hash = 0
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0
  }
  const h = hash >>> 0
  const hue = h % 360
  const bg = `hsl(${hue} 70% 40%)`
  return { initials, bg }
}

export default function CheckinAnalytics() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('monthly')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [badges, setBadges] = useState<AchievementBadge[]>([])

  const tz = tzDefault

  const now = useMemo(() => new Date(), [])
  const todayParts = useMemo(() => getTzYMDParts(now, tz), [now, tz])
  const defaultYear = todayParts.y
  const defaultMonth = todayParts.m

  const [selectedYear, setSelectedYear] = useState(defaultYear)
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)

  useEffect(() => {
    // Backend treats end_date as an exclusive upper bound (start of that local day).
    // So we pass "tomorrow" to include today's check-ins.
    const endExclusive = new Date(now)
    endExclusive.setDate(endExclusive.getDate() + 1)
    const endExclusiveParts = getTzYMDParts(endExclusive, tz)
    const endKey = dateKey(endExclusiveParts.y, endExclusiveParts.m, endExclusiveParts.day)

    const start = new Date(now)
    start.setDate(start.getDate() - 370)
    const startParts = getTzYMDParts(start, tz)
    const startKey = dateKey(startParts.y, startParts.m, startParts.day)

    setLoading(true)
    setError(null)
    Promise.all([
      listCheckins(5000, false, { startDate: startKey, endDate: endKey }),
      listBadges({ startDate: startKey, endDate: endKey, limit: 5000 }),
    ])
      .then(([ci, bd]) => {
        setCheckins(ci)
        setBadges(bd)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [now, todayParts.day, todayParts.m, todayParts.y, tz])

  const checkinsByDateKey = useMemo(() => {
    const map = new Map<string, CheckIn[]>()
    for (const c of checkins) {
      const parts = getCheckinYMD(c, tz)
      const key = dateKey(parts.y, parts.m, parts.day)
      const arr = map.get(key)
      if (arr) arr.push(c)
      else map.set(key, [c])
    }
    return map
  }, [checkins, tz])

  const badgesByDateKey = useMemo(() => {
    const map = new Map<string, AchievementBadge[]>()
    for (const b of badges) {
      const parsed = parseDateKey(b.earned_date_local)
      if (!parsed) continue
      const key = dateKey(parsed.y, parsed.m, parsed.day)
      const arr = map.get(key)
      if (arr) arr.push(b)
      else map.set(key, [b])
    }
    return map
  }, [badges])

  const dailyData = useMemo(() => {
    const days: string[] = []
    const end = new Date(now)
    // last 14 local-ish days, then format into tz.
    for (let i = 13; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(d.getDate() - i)
      const p = getTzYMDParts(d, tz)
      days.push(dateKey(p.y, p.m, p.day))
    }

    return days.map((k) => {
      const arr = checkinsByDateKey.get(k) ?? []
      const counts: Record<CheckinStatus, number> = {
        normal: 0,
        late: 0,
        leave: 0,
        outside: 0,
      }
      for (const c of arr) counts[c.status] += 1
      const joined = arr.length
      const dayBadges = badgesByDateKey.get(k) ?? []
      return { dateKey: k, joined, counts, dayBadges }
    })
  }, [badgesByDateKey, checkinsByDateKey, now, tz])

  const yearlyData = useMemo(() => {
    const map = new Map<string, { joined: number; counts: Record<CheckinStatus, number> }>()
    for (const c of checkins) {
      const parts = getCheckinYMD(c, tz)
      const mKey = `${parts.y}-${pad2(parts.m)}`
      const cur = map.get(mKey) ?? {
        joined: 0,
        counts: { normal: 0, late: 0, leave: 0, outside: 0 },
      }
      cur.joined += 1
      cur.counts[c.status] += 1
      map.set(mKey, cur)
    }

    // Render the selected year only; if you want rolling 12 months, we can adjust.
    const badgeMonthCounts = new Map<string, number>()
    for (const b of badges) {
      const parsed = parseDateKey(b.earned_date_local)
      if (!parsed || parsed.y !== selectedYear) continue
      const mKey = `${parsed.y}-${pad2(parsed.m)}`
      badgeMonthCounts.set(mKey, (badgeMonthCounts.get(mKey) ?? 0) + 1)
    }

    const res: Array<{
      monthKey: string
      joined: number
      counts: Record<CheckinStatus, number>
      badgeCount: number
    }> = []
    for (let m = 1; m <= 12; m++) {
      const mKey = `${selectedYear}-${pad2(m)}`
      const v = map.get(mKey) ?? {
        joined: 0,
        counts: { normal: 0, late: 0, leave: 0, outside: 0 },
      }
      res.push({ monthKey: mKey, ...v, badgeCount: badgeMonthCounts.get(mKey) ?? 0 })
    }
    return res
  }, [badges, checkins, selectedYear, tz])

  const monthlyMatrix = useMemo(() => {
    const monthIndex0 = selectedMonth - 1
    const daysInMonth = new Date(Date.UTC(selectedYear, monthIndex0 + 1, 0)).getUTCDate()
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

    const usersSet = new Set<string>()

    // statusByUserDay[nickname][dateKey] => most relevant status for that day
    const statusByUserDay = new Map<string, Map<string, CheckinStatus>>()
    for (const c of checkins) {
      const p = getCheckinYMD(c, tz)
      if (p.y !== selectedYear || p.m !== selectedMonth) continue
      usersSet.add(c.nickname)
      const dKey = dateKey(p.y, p.m, p.day)
      const userMap = statusByUserDay.get(c.nickname) ?? new Map()
      userMap.set(dKey, pickDominantStatus(userMap.get(dKey), c.status))
      statusByUserDay.set(c.nickname, userMap)
    }

    const badgesByUserDay = new Map<string, Map<string, AchievementBadge[]>>()
    for (const b of badges) {
      const p = parseDateKey(b.earned_date_local)
      if (!p || p.y !== selectedYear || p.m !== selectedMonth) continue
      usersSet.add(b.nickname)
      const dKey = dateKey(p.y, p.m, p.day)
      const userMap = badgesByUserDay.get(b.nickname) ?? new Map()
      const arr = userMap.get(dKey) ?? []
      arr.push(b)
      userMap.set(dKey, arr)
      badgesByUserDay.set(b.nickname, userMap)
    }

    const users = Array.from(usersSet).sort()
    return { users, days, statusByUserDay, badgesByUserDay }
  }, [badges, checkins, selectedMonth, selectedYear, tz])

  const availableYears = useMemo(() => {
    const s = new Set<number>()
    for (const c of checkins) {
      const p = getCheckinYMD(c, tz)
      s.add(p.y)
    }
    for (const b of badges) {
      const parsed = parseDateKey(b.earned_date_local)
      if (parsed) s.add(parsed.y)
    }
    const arr = Array.from(s).sort((a, b) => a - b)
    if (arr.length === 0) return [selectedYear]
    return arr
  }, [badges, checkins, selectedYear, tz])

  return (
    <section className="analytics">
      <div className="analyticsTop">
        <h2 style={{ marginBottom: 0 }}>{t('stats.title')}</h2>
        <div className="analyticsControls">
          <div className="tabs">
            <button type="button" className={tab === 'daily' ? 'tabActive' : ''} onClick={() => setTab('daily')}>
              {t('stats.daily')}
            </button>
            <button type="button" className={tab === 'monthly' ? 'tabActive' : ''} onClick={() => setTab('monthly')}>
              {t('stats.monthly')}
            </button>
            <button type="button" className={tab === 'yearly' ? 'tabActive' : ''} onClick={() => setTab('yearly')}>
              {t('stats.yearly')}
            </button>
          </div>

          <div className="filters">
            <label className="label">
              {t('stats.year')}
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            {tab === 'monthly' ? (
              <label className="label">
                {t('stats.month')}
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {getMonthLabel(selectedYear, m)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">{t('stats.loading')}</p> : null}

      {!loading && !error && tab === 'daily' ? (
        <div className="dailyGrid">
          {dailyData.map((d) => (
            <div key={d.dateKey} className="dailyCell">
              <div className="dailyDate">{d.dateKey.slice(5)}</div>
              <div className="dailyCount">
                {d.joined} <span className="dailySmall">{t('stats.joins')}</span>
              </div>
              {statusOrder.map((status) => (
                <div key={status} className={`dailyCount status-${status}`}>
                  {d.counts[status]} <span className="dailySmall">{t(`stats.status.${status}`)}</span>
                </div>
              ))}
              {d.dayBadges.length > 0 ? (
                <div className="dailyBadges">
                  <div className="dailyBadgesTitle">{t('stats.badgesThatDay')}</div>
                  <ul className="dailyBadgeList">
                    {d.dayBadges.map((b) => (
                      <li key={b.id} className="dailyBadgeItem">
                        <span className="dailyBadgeMedal" aria-hidden="true">
                          🏅
                        </span>
                        <span className="dailyBadgeText">
                          <strong>{b.nickname}</strong>
                          <span className="muted"> — {b.title}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !error && tab === 'yearly' ? (
        <div className="yearGrid">
          {yearlyData.map((m) => (
            <div key={m.monthKey} className="yearTile">
              <div className="yearMonth">{getMonthLabel(selectedYear, Number(m.monthKey.slice(5, 7)))}</div>
              <div className="yearCounts">
                {statusOrder.map((status) => (
                  <span key={status} title={t(`stats.status.${status}`)}>
                    <span className={`dot ${status}Dot`} /> {m.counts[status]}
                  </span>
                ))}
              </div>
              {m.badgeCount > 0 ? (
                <div className="yearBadgeRow muted">
                  {t('stats.badgesCountShort', { count: m.badgeCount })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !error && tab === 'monthly' ? (
        <div className="matrixWrap">
          <div className="matrixLegend">
            <span className="legendItem">
              <span className="legendChip normalChip" /> {t('stats.status.normal')}
            </span>
            <span className="legendItem">
              <span className="legendChip lateChip" /> {t('stats.status.late')}
            </span>
            <span className="legendItem">
              <span className="legendChip leaveChip" /> {t('stats.status.leave')}
            </span>
            <span className="legendItem">
              <span className="legendChip outsideChip" /> {t('stats.status.outside')}
            </span>
            <span className="legendItem">
              <span className="legendChip emptyChip" /> {t('stats.noCheckin')}
            </span>
            <span className="legendItem">
              <span className="legendChip badgeChip" /> {t('stats.badgeLegend')}
            </span>
          </div>

          <div className="matrixScroll">
            <div className="matrix">
              <div
                className="matrixHeaderRow"
                style={{
                  gridTemplateColumns: `160px repeat(${monthlyMatrix.days.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="matrixUserHeader">{t('stats.users')}</div>
                {monthlyMatrix.days.map((d) => (
                  <div key={d} className="matrixDayHeader">
                    {d}
                  </div>
                ))}
              </div>

              {monthlyMatrix.users.map((u) => {
                const av = avatarFor(u)
                const userMap = monthlyMatrix.statusByUserDay.get(u)
                const badgeMap = monthlyMatrix.badgesByUserDay.get(u)
                return (
                  <div
                    key={u}
                    className="matrixUserRow"
                    style={{
                      gridTemplateColumns: `160px repeat(${monthlyMatrix.days.length}, minmax(0, 1fr))`,
                    }}
                  >
                    <div className="matrixUserCell">
                      <span className="avatarMini" style={{ background: av.bg }}>
                        {av.initials}
                      </span>
                      <span className="userName" title={u}>
                        {u}
                      </span>
                    </div>

                    {monthlyMatrix.days.map((d) => {
                      const dk = dateKey(selectedYear, selectedMonth, d)
                      const st = userMap?.get(dk)
                      const badgeList = badgeMap?.get(dk) ?? []
                      const badgeTitles = badgeList.map((x) => x.title).join(', ')
                      const badgeTitle =
                        badgeList.length > 0
                          ? `${t('stats.badgeTooltip')}: ${badgeTitles}`
                          : ''
                      if (!st && badgeList.length === 0) {
                        return (
                          <div key={d} className="cell empty" aria-label={t('stats.noCheckin')}>
                            <span className="cellInner" />
                          </div>
                        )
                      }
                      const titleParts = [st ? t(`stats.status.${st}`) : '', badgeTitle].filter(Boolean)
                      const badgeOnly = !st && badgeList.length > 0
                      const cellKind = st ?? (badgeOnly ? 'badgeOnly' : 'empty')
                      const showMedalInside = badgeOnly
                      return (
                        <div
                          key={d}
                          className={`cell ${cellKind} ${badgeList.length > 0 ? 'hasBadge' : ''}`}
                          title={titleParts.join(' · ')}
                          aria-label={titleParts.join(' · ')}
                        >
                          <span className="cellInner">
                            {showMedalInside
                              ? badgeList.length > 1
                                ? String(badgeList.length)
                                : '🏅'
                              : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

