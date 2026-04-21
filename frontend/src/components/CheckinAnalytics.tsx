import { useEffect, useMemo, useState } from 'react'

import {
  getStatisticsSettings,
  listBadges,
  listCheckins,
  type AchievementBadge,
  type CheckIn,
} from '../api'
import { useI18n } from '../i18n'
import { avatarFor } from '../avatar'

type Tab = 'monthly' | 'weekly' | 'yearly'

type Ymd = { y: number; m: number; day: number }
type CheckinStatus = CheckIn['status']

const tzDefault = (import.meta.env.VITE_CHECKIN_TZ as string | undefined) ?? 'Asia/Tokyo'
const statusOrder: CheckinStatus[] = ['morning', 'night', 'late', 'leave', 'outside']

function defaultWeeklyNoCheckinThreshold(): number {
  const raw = import.meta.env.VITE_STATS_WEEKLY_NO_CHECKIN_THRESHOLD as string | undefined
  const n = raw !== undefined && raw !== '' ? Number(raw) : 2
  return Number.isFinite(n) && n >= 0 ? n : 2
}

function normalizeStatusForStats(status: CheckinStatus): CheckinStatus {
  return status === 'normal' ? 'morning' : status
}

function emptyStatusCounts(): Record<CheckinStatus, number> {
  return {
    morning: 0,
    night: 0,
    normal: 0,
    late: 0,
    leave: 0,
    outside: 0,
  }
}

function bumpStatusCount(counts: Record<CheckinStatus, number>, status: string) {
  const raw = (status in counts ? status : 'outside') as CheckinStatus
  const key = normalizeStatusForStats(raw)
  counts[key] += 1
}

function pickDominantStatus(current: CheckinStatus | undefined, incoming: CheckinStatus): CheckinStatus {
  if (!current) return incoming
  const rank: Record<CheckinStatus, number> = {
    morning: 6,
    night: 5,
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

function mondayUtcOfCalendarWeek(y: number, m: number, d: number): Ymd {
  const t = Date.UTC(y, m - 1, d)
  const dow = new Date(t).getUTCDay()
  const daysFromMon = (dow + 6) % 7
  const monMs = t - daysFromMon * 86400000
  const dt = new Date(monMs)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, day: dt.getUTCDate() }
}

function addUtcCalendarDays(y: number, m: number, d: number, delta: number): Ymd {
  const t = Date.UTC(y, m - 1, d + delta)
  const dt = new Date(t)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, day: dt.getUTCDate() }
}

function weekDayKeysFromMonday(mon: Ymd): string[] {
  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    const p = addUtcCalendarDays(mon.y, mon.m, mon.day, i)
    keys.push(dateKey(p.y, p.m, p.day))
  }
  return keys
}

function localeForStats(lang: 'en' | 'zh' | 'ja') {
  if (lang === 'zh') return 'zh-CN'
  if (lang === 'ja') return 'ja-JP'
  return 'en-US'
}

function formatShortUtcDate(y: number, m: number, d: number, lang: 'en' | 'zh' | 'ja') {
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeForStats(lang), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function weekRangeLabel(mon: Ymd, lang: 'en' | 'zh' | 'ja') {
  const sun = addUtcCalendarDays(mon.y, mon.m, mon.day, 6)
  return `${formatShortUtcDate(mon.y, mon.m, mon.day, lang)} – ${formatShortUtcDate(sun.y, sun.m, sun.day, lang)}`
}

function weekdayColumnLabel(y: number, m: number, d: number, lang: 'en' | 'zh' | 'ja') {
  const wd = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeForStats(lang), {
    weekday: 'short',
    timeZone: 'UTC',
  })
  return `${wd} ${d}`
}

export default function CheckinAnalytics() {
  const { t, lang } = useI18n()
  const [tab, setTab] = useState<Tab>('weekly')
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
  const [weekMonday, setWeekMonday] = useState<Ymd>(() => {
    const p = getTzYMDParts(new Date(), tzDefault)
    return mondayUtcOfCalendarWeek(p.y, p.m, p.day)
  })
  const [noCheckinAlertThreshold, setNoCheckinAlertThreshold] = useState(defaultWeeklyNoCheckinThreshold)

  useEffect(() => {
    function loadThreshold() {
      getStatisticsSettings()
        .then((s) => setNoCheckinAlertThreshold(s.weekly_no_checkin_threshold))
        .catch(() => {})
    }
    loadThreshold()
    window.addEventListener('focus', loadThreshold)
    return () => window.removeEventListener('focus', loadThreshold)
  }, [])

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

  const yearlyData = useMemo(() => {
    const map = new Map<string, { joined: number; counts: Record<CheckinStatus, number> }>()
    for (const c of checkins) {
      const parts = getCheckinYMD(c, tz)
      const mKey = `${parts.y}-${pad2(parts.m)}`
      const cur = map.get(mKey) ?? {
        joined: 0,
        counts: emptyStatusCounts(),
      }
      cur.joined += 1
      bumpStatusCount(cur.counts, c.status)
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
        counts: emptyStatusCounts(),
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
      userMap.set(dKey, pickDominantStatus(userMap.get(dKey), normalizeStatusForStats(c.status)))
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

  const monthlyMemberSummary = useMemo(() => {
    const byUser = new Map<
      string,
      { morning: number; night: number; late: number; leave: number; total: number }
    >()
    const checkinDaysByUser = new Map<string, Set<string>>()
    const badgeDaysByUser = new Map<string, Set<string>>()
    for (const c of checkins) {
      const p = getCheckinYMD(c, tz)
      if (p.y !== selectedYear || p.m !== selectedMonth) continue
      const cur = byUser.get(c.nickname) ?? { morning: 0, night: 0, late: 0, leave: 0, total: 0 }
      if (c.status === 'morning' || c.status === 'normal') cur.morning += 1
      if (c.status === 'night') cur.night += 1
      if (c.status === 'late') cur.late += 1
      if (c.status === 'leave') cur.leave += 1
      cur.total += 1
      byUser.set(c.nickname, cur)
      const dk = dateKey(p.y, p.m, p.day)
      const s = checkinDaysByUser.get(c.nickname) ?? new Set()
      s.add(dk)
      checkinDaysByUser.set(c.nickname, s)
    }
    for (const b of badges) {
      const p = parseDateKey(b.earned_date_local)
      if (!p || p.y !== selectedYear || p.m !== selectedMonth) continue
      const dk = dateKey(p.y, p.m, p.day)
      const s = badgeDaysByUser.get(b.nickname) ?? new Set()
      s.add(dk)
      badgeDaysByUser.set(b.nickname, s)
    }
    const monthIndex0 = selectedMonth - 1
    const daysInMonth = new Date(Date.UTC(selectedYear, monthIndex0 + 1, 0)).getUTCDate()
    return Array.from(byUser.entries())
      .map(([nickname, counts]) => {
        let noCheckin = 0
        const hasCheckin = checkinDaysByUser.get(nickname) ?? new Set()
        const hasBadge = badgeDaysByUser.get(nickname) ?? new Set()
        for (let d = 1; d <= daysInMonth; d++) {
          const dk = dateKey(selectedYear, selectedMonth, d)
          if (!hasCheckin.has(dk) && !hasBadge.has(dk)) noCheckin += 1
        }
        return { nickname, ...counts, noCheckin }
      })
      .sort((a, b) => a.nickname.localeCompare(b.nickname))
  }, [badges, checkins, selectedMonth, selectedYear, tz])

  const weeklyMatrix = useMemo(() => {
    const dayKeys = weekDayKeysFromMonday(weekMonday)
    const keySet = new Set(dayKeys)
    const usersSet = new Set<string>()
    const statusByUserDay = new Map<string, Map<string, CheckinStatus>>()
    for (const c of checkins) {
      const p = getCheckinYMD(c, tz)
      const dKey = dateKey(p.y, p.m, p.day)
      if (!keySet.has(dKey)) continue
      usersSet.add(c.nickname)
      const userMap = statusByUserDay.get(c.nickname) ?? new Map()
      userMap.set(dKey, pickDominantStatus(userMap.get(dKey), normalizeStatusForStats(c.status)))
      statusByUserDay.set(c.nickname, userMap)
    }
    const badgesByUserDay = new Map<string, Map<string, AchievementBadge[]>>()
    for (const b of badges) {
      const p = parseDateKey(b.earned_date_local)
      if (!p) continue
      const dKey = dateKey(p.y, p.m, p.day)
      if (!keySet.has(dKey)) continue
      usersSet.add(b.nickname)
      const userMap = badgesByUserDay.get(b.nickname) ?? new Map()
      const arr = userMap.get(dKey) ?? []
      arr.push(b)
      userMap.set(dKey, arr)
      badgesByUserDay.set(b.nickname, userMap)
    }
    const users = Array.from(usersSet).sort()
    return { users, dayKeys, statusByUserDay, badgesByUserDay }
  }, [badges, checkins, weekMonday, tz])

  const weeklyMemberSummary = useMemo(() => {
    const dayKeys = weekDayKeysFromMonday(weekMonday)
    const keySet = new Set(dayKeys)
    const byUser = new Map<
      string,
      { morning: number; night: number; late: number; leave: number; total: number }
    >()
    const checkinDaysByUser = new Map<string, Set<string>>()
    const badgeDaysByUser = new Map<string, Set<string>>()
    for (const c of checkins) {
      const p = getCheckinYMD(c, tz)
      const dk = dateKey(p.y, p.m, p.day)
      if (!keySet.has(dk)) continue
      const cur = byUser.get(c.nickname) ?? { morning: 0, night: 0, late: 0, leave: 0, total: 0 }
      if (c.status === 'morning' || c.status === 'normal') cur.morning += 1
      if (c.status === 'night') cur.night += 1
      if (c.status === 'late') cur.late += 1
      if (c.status === 'leave') cur.leave += 1
      cur.total += 1
      byUser.set(c.nickname, cur)
      const s = checkinDaysByUser.get(c.nickname) ?? new Set()
      s.add(dk)
      checkinDaysByUser.set(c.nickname, s)
    }
    for (const b of badges) {
      const p = parseDateKey(b.earned_date_local)
      if (!p) continue
      const dk = dateKey(p.y, p.m, p.day)
      if (!keySet.has(dk)) continue
      const s = badgeDaysByUser.get(b.nickname) ?? new Set()
      s.add(dk)
      badgeDaysByUser.set(b.nickname, s)
    }
    return Array.from(byUser.entries())
      .map(([nickname, counts]) => {
        let noCheckin = 0
        const hasCheckin = checkinDaysByUser.get(nickname) ?? new Set()
        const hasBadge = badgeDaysByUser.get(nickname) ?? new Set()
        for (const dk of dayKeys) {
          if (!hasCheckin.has(dk) && !hasBadge.has(dk)) noCheckin += 1
        }
        return { nickname, ...counts, noCheckin }
      })
      .sort((a, b) => a.nickname.localeCompare(b.nickname))
  }, [badges, checkins, weekMonday, tz])

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
            <button type="button" className={tab === 'weekly' ? 'tabActive' : ''} onClick={() => setTab('weekly')}>
              {t('stats.weekly')}
            </button>
            <button type="button" className={tab === 'monthly' ? 'tabActive' : ''} onClick={() => setTab('monthly')}>
              {t('stats.monthly')}
            </button>
            <button type="button" className={tab === 'yearly' ? 'tabActive' : ''} onClick={() => setTab('yearly')}>
              {t('stats.yearly')}
            </button>
          </div>

          <div className="filters">
            {tab !== 'weekly' ? (
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
            ) : null}

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

            {tab === 'weekly' ? (
              <div className="weekNav">
                <button
                  type="button"
                  title={t('stats.weekPrev')}
                  onClick={() => setWeekMonday((w) => addUtcCalendarDays(w.y, w.m, w.day, -7))}
                >
                  ‹
                </button>
                <span className="weekNavLabel">{weekRangeLabel(weekMonday, lang)}</span>
                <button
                  type="button"
                  title={t('stats.weekNext')}
                  onClick={() => setWeekMonday((w) => addUtcCalendarDays(w.y, w.m, w.day, 7))}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">{t('stats.loading')}</p> : null}

      {!loading && !error && tab === 'weekly' ? (
        <div className="matrixWrap">
          <details className="memberMonthSummary" open={false}>
            <summary className="memberMonthSummaryTitle memberMonthSummaryToggle">
              {t('stats.memberWeeklySummaryTitle', { range: weekRangeLabel(weekMonday, lang) })}
            </summary>
            <p className="muted statsWeeklyThresholdHint">
              {t('stats.weeklyNoCheckinThresholdHint', { threshold: noCheckinAlertThreshold })}
            </p>
            {weeklyMemberSummary.length === 0 ? (
              <p className="muted">{t('stats.memberWeeklySummaryEmpty')}</p>
            ) : (
              <div className="memberMonthSummaryTableWrap">
                <table className="memberMonthSummaryTable">
                  <thead>
                    <tr>
                      <th>{t('stats.users')}</th>
                      <th>{t('stats.status.morning')}</th>
                      <th>{t('stats.status.night')}</th>
                      <th>{t('stats.status.late')}</th>
                      <th>{t('stats.status.leave')}</th>
                      <th>{t('stats.noCheckin')}</th>
                      <th>{t('stats.memberMonthlySummaryTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyMemberSummary.map((row) => (
                      <tr
                        key={row.nickname}
                        className={
                          row.noCheckin > noCheckinAlertThreshold ? 'weeklyNoCheckinHighlight' : undefined
                        }
                      >
                        <td>{row.nickname}</td>
                        <td>{row.morning}</td>
                        <td>{row.night}</td>
                        <td>{row.late}</td>
                        <td>{row.leave}</td>
                        <td>{row.noCheckin}</td>
                        <td>{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>

          <div className="matrixLegend">
            <span className="legendItem">
              <span className="legendChip morningChip" /> {t('stats.status.morning')}
            </span>
            <span className="legendItem">
              <span className="legendChip nightChip" /> {t('stats.status.night')}
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
                  gridTemplateColumns: `160px repeat(${weeklyMatrix.dayKeys.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="matrixUserHeader">{t('stats.users')}</div>
                {weeklyMatrix.dayKeys.map((dk) => {
                  const parsed = parseDateKey(dk)
                  const label = parsed ? weekdayColumnLabel(parsed.y, parsed.m, parsed.day, lang) : dk
                  return (
                    <div key={dk} className="matrixDayHeader">
                      {label}
                    </div>
                  )
                })}
              </div>

              {weeklyMatrix.users.map((u) => {
                const av = avatarFor(u)
                const userMap = weeklyMatrix.statusByUserDay.get(u)
                const badgeMap = weeklyMatrix.badgesByUserDay.get(u)
                return (
                  <div
                    key={u}
                    className="matrixUserRow"
                    style={{
                      gridTemplateColumns: `160px repeat(${weeklyMatrix.dayKeys.length}, minmax(0, 1fr))`,
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

                    {weeklyMatrix.dayKeys.map((dk) => {
                      const st = userMap?.get(dk)
                      const badgeList = badgeMap?.get(dk) ?? []
                      const badgeTitles = badgeList.map((x) => x.title).join(', ')
                      const badgeTitle =
                        badgeList.length > 0
                          ? `${t('stats.badgeTooltip')}: ${badgeTitles}`
                          : ''
                      if (!st && badgeList.length === 0) {
                        return (
                          <div key={dk} className="cell empty" aria-label={t('stats.noCheckin')}>
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
                          key={dk}
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

      {!loading && !error && tab === 'monthly' ? (
        <div className="matrixWrap">
          <details className="memberMonthSummary" open={false}>
            <summary className="memberMonthSummaryTitle memberMonthSummaryToggle">
              {t('stats.memberMonthlySummaryTitle', {
                month: getMonthLabel(selectedYear, selectedMonth),
                year: selectedYear,
              })}
            </summary>
            {monthlyMemberSummary.length === 0 ? (
              <p className="muted">{t('stats.memberMonthlySummaryEmpty')}</p>
            ) : (
              <div className="memberMonthSummaryTableWrap">
                <table className="memberMonthSummaryTable">
                  <thead>
                    <tr>
                      <th>{t('stats.users')}</th>
                      <th>{t('stats.status.morning')}</th>
                      <th>{t('stats.status.night')}</th>
                      <th>{t('stats.status.late')}</th>
                      <th>{t('stats.status.leave')}</th>
                      <th>{t('stats.noCheckin')}</th>
                      <th>{t('stats.memberMonthlySummaryTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyMemberSummary.map((row) => (
                      <tr key={row.nickname}>
                        <td>{row.nickname}</td>
                        <td>{row.morning}</td>
                        <td>{row.night}</td>
                        <td>{row.late}</td>
                        <td>{row.leave}</td>
                        <td>{row.noCheckin}</td>
                        <td>{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>

          <div className="matrixLegend">
            <span className="legendItem">
              <span className="legendChip morningChip" /> {t('stats.status.morning')}
            </span>
            <span className="legendItem">
              <span className="legendChip nightChip" /> {t('stats.status.night')}
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
    </section>
  )
}

