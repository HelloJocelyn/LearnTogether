const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const base = rawBase.replace(/\/+$/, '')

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

  return (await res.json()) as T
}

export type Health = { ok: boolean }
export type CheckIn = {
  id: number
  created_at: string
  nickname: string
  is_real: boolean
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
}

export type AttendanceImportDetail = {
  import_info: AttendanceImport
  items: AttendanceImportItem[]
}

export type Member = {
  id: number
  created_at: string
  name: string
  is_active: boolean
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

export function createCheckin(nickname: string) {
  return request<CheckIn>('/api/checkins', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
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

export function createMember(name: string) {
  return request<Member>('/api/members', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function deleteMember(memberId: number) {
  return request<void>(`/api/members/${memberId}`, {
    method: 'DELETE',
  })
}

