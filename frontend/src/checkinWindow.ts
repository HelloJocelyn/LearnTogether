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
