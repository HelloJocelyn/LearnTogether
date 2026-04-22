const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const base = rawBase.replace(/\/+$/, '')

export function apiBaseUrl(): string {
  return base
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const res = await fetch(`${base}${path}`, {
    headers: isFormData
      ? { ...(init?.headers ?? {}) }
      : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`)
  }

  if (res.status === 204) {
    return undefined as T
  }
  const text = await res.text()
  if (!text.trim()) {
    return undefined as T
  }
  return JSON.parse(text) as T
}

export type Health = { ok: boolean }
export type CheckIn = {
  id: number
  created_at: string
  nickname: string
  is_real: boolean
  status: 'morning' | 'night' | 'normal' | 'late' | 'leave' | 'outside'
  checkin_date_local?: string | null
}

export type AttendanceStatus = 'attended' | 'not_attended' | 'unknown'

export type AttendanceImport = {
  id: number
  created_at: string
  source_filename: string
  ocr_raw_text: string
  status: 'draft' | 'confirmed' | 'failed'
}

export type AttendanceImportItem = {
  id: number
  import_id: number
  name: string
  attendance_status: AttendanceStatus
  confidence: number
  is_edited: boolean
  roll_number?: number | null
  notes?: string | null
  detail_json?: string | null
}

export type AttendanceImportDetail = {
  import_info: AttendanceImport
  items: AttendanceImportItem[]
}

export type Member = {
  id: number
  created_at: string
  name: string
  role: string
  goal: string
  is_active: boolean
}

export type CheckinWindowConfig = {
  morning_start: string
  morning_end: string
  night_start: string
  night_end: string
  app_env: string
  source: string
}

export type DailyHero = {
  date: string
  theme?: string | null
  title?: string | null
  subtitle?: string | null
  image_url?: string | null
}

export type AchievementBadge = {
  id: number
  created_at: string
  nickname: string
  title: string
  earned_date_local: string
  member_id?: number | null
  certificate_image_url?: string | null
}

export function getHealth() {
  return request<Health>('/api/health')
}

export function listCheckins(
  limit = 50,
  realOnly = false,
  opts?: { startDate?: string; endDate?: string; todayOnly?: boolean }
) {
  const qs = new URLSearchParams({
    limit: String(limit),
    ...(realOnly ? { real_only: 'true' } : {}),
    ...(opts?.todayOnly ? { today_only: 'true' } : {}),
    ...(opts?.startDate ? { start_date: opts.startDate } : {}),
    ...(opts?.endDate ? { end_date: opts.endDate } : {}),
  })
  return request<CheckIn[]>(`/api/checkins?${qs.toString()}`)
}

export function createCheckin(nickname: string, status?: 'leave') {
  return request<CheckIn>('/api/checkins', {
    method: 'POST',
    body: JSON.stringify({
      nickname,
      ...(status ? { status } : {}),
    }),
  })
}

export function createScheduledLeave(
  nickname: string,
  leaveStartDateLocal: string,
  leaveEndDateLocal: string,
) {
  return request<CheckIn[]>('/api/checkins/scheduled-leave', {
    method: 'POST',
    body: JSON.stringify({
      nickname,
      leave_start_date_local: leaveStartDateLocal,
      leave_end_date_local: leaveEndDateLocal,
    }),
  })
}

export function upsertAttendanceCell(
  nickname: string,
  checkinDateLocal: string,
  status: CheckIn['status'] | null,
) {
  return request<CheckIn[]>('/api/checkins/attendance-cell', {
    method: 'PUT',
    body: JSON.stringify({
      nickname,
      checkin_date_local: checkinDateLocal,
      status,
    }),
  })
}

export function createAttendanceImportFromImage(file: File) {
  const formData = new FormData()
  formData.append('image', file)
  return request<AttendanceImportDetail>('/api/attendance-imports/ocr', {
    method: 'POST',
    body: formData,
  })
}

export function createAttendanceImportFromCsv(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request<AttendanceImportDetail>('/api/attendance-imports/csv', {
    method: 'POST',
    body: formData,
  })
}

export function getAttendanceImport(importId: number) {
  return request<AttendanceImportDetail>(`/api/attendance-imports/${importId}`)
}

export function updateAttendanceImportItems(
  importId: number,
  items: Array<{ id?: number; name: string; attendance_status: AttendanceStatus }>
) {
  return request<AttendanceImportItem[]>(`/api/attendance-imports/${importId}/items`, {
    method: 'PUT',
    body: JSON.stringify(items),
  })
}

export function confirmAttendanceImport(importId: number) {
  return request<{
    import_id: number
    status: 'draft' | 'confirmed' | 'failed'
    total: number
    attended: number
    not_attended: number
    unknown: number
  }>(`/api/attendance-imports/${importId}/confirm`, {
    method: 'POST',
  })
}

export function listMembers() {
  return request<Member[]>('/api/members')
}

export function createMember(name: string, role: string, goal: string) {
  return request<Member>('/api/members', {
    method: 'POST',
    body: JSON.stringify({ name, role, goal }),
  })
}

export function deleteMember(memberId: number) {
  return request<void>(`/api/members/${memberId}`, {
    method: 'DELETE',
  })
}

export function getCheckinWindowConfig() {
  return request<CheckinWindowConfig>('/api/settings/checkin-window')
}

export type ZoomJoinHints = {
  meeting_id: string | null
  passcode: string | null
  join_url: string | null
}

export type StatisticsSettings = {
  weekly_no_checkin_threshold: number
}

export function getStatisticsSettings() {
  return request<StatisticsSettings>('/api/settings/statistics')
}

export function updateStatisticsSettings(weeklyNoCheckinThreshold: number) {
  return request<StatisticsSettings>('/api/settings/statistics', {
    method: 'PUT',
    body: JSON.stringify({ weekly_no_checkin_threshold: weeklyNoCheckinThreshold }),
  })
}

export type DailyHeroSettings = {
  daily_hero_openai_api_key_set: boolean
}

export function getDailyHeroSettings() {
  return request<DailyHeroSettings>('/api/settings/daily-hero')
}

export function updateDailyHeroSettings(dailyHeroOpenaiApiKey: string) {
  return request<DailyHeroSettings>('/api/settings/daily-hero', {
    method: 'PUT',
    body: JSON.stringify({ daily_hero_openai_api_key: dailyHeroOpenaiApiKey }),
  })
}

export function getZoomJoinHints() {
  return request<ZoomJoinHints>('/api/settings/zoom-join')
}

export function updateZoomJoinHints(meeting_id: string, passcode: string, join_url: string) {
  return request<ZoomJoinHints>('/api/settings/zoom-join', {
    method: 'PUT',
    body: JSON.stringify({ meeting_id, passcode, join_url }),
  })
}

export function updateCheckinWindowConfig(
  morning_start: string,
  morning_end: string,
  night_start: string,
  night_end: string
) {
  return request<CheckinWindowConfig>('/api/settings/checkin-window', {
    method: 'PUT',
    body: JSON.stringify({ morning_start, morning_end, night_start, night_end }),
  })
}

export function getDailyHero() {
  return request<DailyHero>('/api/daily-hero')
}

export function listBadges(opts?: { startDate?: string; endDate?: string; limit?: number }) {
  const qs = new URLSearchParams({
    ...(opts?.limit != null ? { limit: String(opts.limit) } : {}),
    ...(opts?.startDate ? { start_date: opts.startDate } : {}),
    ...(opts?.endDate ? { end_date: opts.endDate } : {}),
  })
  const q = qs.toString()
  return request<AchievementBadge[]>(q ? `/api/badges?${q}` : '/api/badges')
}

export function createBadge(args: {
  title: string
  earnedDate: string
  nickname?: string
  memberId?: number
  certificate?: File | null
}) {
  const fd = new FormData()
  fd.append('title', args.title)
  fd.append('earned_date', args.earnedDate)
  if (args.memberId != null) {
    fd.append('member_id', String(args.memberId))
  } else {
    fd.append('nickname', args.nickname ?? '')
  }
  if (args.certificate) {
    fd.append('certificate', args.certificate)
  }
  return request<AchievementBadge>('/api/badges', { method: 'POST', body: fd })
}

export function updateBadge(
  badgeId: number,
  args: {
    title: string
    earnedDate: string
    nickname?: string
    memberId?: number
    certificate?: File | null
  }
) {
  const fd = new FormData()
  fd.append('title', args.title)
  fd.append('earned_date', args.earnedDate)
  if (args.memberId != null) {
    fd.append('member_id', String(args.memberId))
  } else {
    fd.append('nickname', args.nickname ?? '')
  }
  if (args.certificate) {
    fd.append('certificate', args.certificate)
  }
  return request<AchievementBadge>(`/api/badges/${badgeId}`, { method: 'PUT', body: fd })
}

export function deleteBadge(badgeId: number) {
  return request<void>(`/api/badges/${badgeId}`, { method: 'DELETE' })
}

export type LearningGoal = {
  id: number
  created_at: string
  name: string
  progress: number
  total_units: number
  complete_units: number
  start_date: string | null
  deadline: string | null
  /** True when complete units are below the linear schedule (start→deadline, CHECKIN_TZ "today"). */
  behind_pace: boolean
  /** Floor of expected complete units by "today" on that schedule, or null if N/A. */
  expected_units_pace: number | null
}

export function listLearningGoals() {
  return request<LearningGoal[]>('/api/learning-goals')
}

export function createLearningGoal(payload: {
  name: string
  progress?: number
  total_units?: number
  complete_units?: number
  start_date?: string | null
  deadline?: string | null
}) {
  return request<LearningGoal>('/api/learning-goals', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      progress: payload.progress ?? 0,
      total_units: payload.total_units ?? 0,
      complete_units: payload.complete_units ?? 0,
      start_date: payload.start_date ?? null,
      deadline: payload.deadline ?? null,
    }),
  })
}

export function updateLearningGoal(
  goalId: number,
  payload: {
    name?: string
    progress?: number
    total_units?: number
    complete_units?: number
    start_date?: string | null
    deadline?: string | null
  }
) {
  return request<LearningGoal>(`/api/learning-goals/${goalId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteLearningGoal(goalId: number) {
  return request<{ ok: boolean }>(`/api/learning-goals/${goalId}`, { method: 'DELETE' })
}

