/** Client-side session classification; keep logic aligned with backend `checkin_config` + `crud._classify_checkin_status` (inclusive window, local clock minutes). */

export type CheckinWindowTimes = {
  morning_start: string
  morning_end: string
  night_start: string
  night_end: string
}

function parseHHMMToMinutes(s: string): number {
  const [h, m] = s.trim().split(':').map((x) => Number(x))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

/** Local wall time minutes from midnight in `timeZone` (same idea as backend local `time`). */
export function localMinutesFromDateInTz(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(date)
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hh * 60 + mm
}

export function classifySession(
  date: Date,
  timeZone: string,
  w: CheckinWindowTimes
): 'morning' | 'night' | 'outside' {
  const t = localMinutesFromDateInTz(date, timeZone)
  const ms = parseHHMMToMinutes(w.morning_start)
  const me = parseHHMMToMinutes(w.morning_end)
  const ns = parseHHMMToMinutes(w.night_start)
  const ne = parseHHMMToMinutes(w.night_end)
  if (ms <= t && t <= me) return 'morning'
  if (ns <= t && t <= ne) return 'night'
  return 'outside'
}

export function formatClockInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

/** Today's calendar date YYYY-MM-DD in `timeZone` (for the given instant). */
export function calendarDateTodayInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Local calendar date (YYYY-MM-DD) for a check-in row (stored local date or created_at in tz). */
export function checkinLocalDateKey(
  c: { checkin_date_local?: string | null; created_at: string },
  timeZone: string,
): string {
  const raw = c.checkin_date_local?.trim()
  if (raw) {
    const m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (m) {
      const y = Number(m[1])
      const mo = Number(m[2])
      const d = Number(m[3])
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return calendarDateTodayInTz(new Date(c.created_at), timeZone)
}

/** Proleptic Gregorian calendar: add `deltaDays` to an ISO date (YYYY-MM-DD). */
export function calendarDatePlusDays(isoYmd: string, deltaDays: number): string {
  const [y, m, d] = isoYmd.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const yy = next.getUTCFullYear()
  const mm = next.getUTCMonth() + 1
  const dd = next.getUTCDate()
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}
