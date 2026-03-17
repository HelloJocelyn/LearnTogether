const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const base = rawBase.replace(/\/+$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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
}

export function getHealth() {
  return request<Health>('/api/health')
}

export function listCheckins(limit = 50, realOnly = false) {
  const qs = new URLSearchParams({
    limit: String(limit),
    ...(realOnly ? { real_only: 'true' } : {}),
  })
  return request<CheckIn[]>(`/api/checkins?${qs.toString()}`)
}

export function createCheckin(nickname: string) {
  return request<CheckIn>('/api/checkins', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  })
}

