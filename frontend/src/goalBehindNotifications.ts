import { listLearningGoals } from './api'
import { isIOS, isStandaloneDisplayMode } from './device'

export const STORAGE_ENABLED_KEY = 'lt.goalsBehind.notifyEnabled'
export const STORAGE_LAST_NOTIFY_DAY_KEY = 'lt.goalsBehind.lastNotifyDay'

const CHECKIN_TZ = (import.meta.env.VITE_CHECKIN_TZ as string | undefined) ?? 'Asia/Tokyo'

export function getGoalsBehindNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setGoalsBehindNotifyEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_ENABLED_KEY, '1')
    else localStorage.removeItem(STORAGE_ENABLED_KEY)
  } catch {
    /* ignore */
  }
}

/** Calendar date in CHECKIN_TZ (aligned with backend "today" for pace). */
export function todayCalendarDayInCheckinTz(): string {
  const d = new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHECKIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export const GOALS_BEHIND_REMIND_EVENT = 'lt-goals-behind-remind'

export type GoalsBehindRemindDetail = { title: string; body: string; count: number }

/** iOS (and installed PWAs generally) do not reliably surface local Notifications; use an in-app banner. */
export function prefersInAppGoalsBehindReminder(): boolean {
  if (typeof window === 'undefined') return false
  return isIOS() || isStandaloneDisplayMode()
}

function dispatchInAppReminder(detail: GoalsBehindRemindDetail): void {
  try {
    window.dispatchEvent(new CustomEvent<GoalsBehindRemindDetail>(GOALS_BEHIND_REMIND_EVENT, { detail }))
  } catch {
    /* ignore */
  }
}

async function showBrowserNotification(title: string, body: string): Promise<void> {
  try {
    const reg =
      typeof navigator.serviceWorker !== 'undefined'
        ? await navigator.serviceWorker.ready.catch(() => undefined)
        : undefined
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        tag: 'learnTogether-goals-behind',
      })
      return
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof Notification !== 'undefined') {
      new Notification(title, { body, icon: '/pwa-192.png' })
    }
  } catch {
    /* ignore — e.g. iOS blocking non-push notifications */
  }
}

async function deliverBehindReminder(title: string, body: string, count: number): Promise<void> {
  const detail: GoalsBehindRemindDetail = { title, body, count }
  if (prefersInAppGoalsBehindReminder()) {
    dispatchInAppReminder(detail)
    return
  }
  await showBrowserNotification(title, body)
}

export type BehindNotifyReason =
  | 'disabled'
  | 'no-permission'
  | 'already-today'
  | 'no-behind'
  | 'shown'
  | 'error'

let behindCheckInflight: Promise<{ shown: boolean; reason: BehindNotifyReason }> | null = null

export async function runBehindGoalNotificationCheck(opts: {
  getMessage: (count: number) => { title: string; body: string }
  force?: boolean
}): Promise<{ shown: boolean; reason: BehindNotifyReason }> {
  if (behindCheckInflight) return behindCheckInflight

  behindCheckInflight = runBehindGoalNotificationCheckInner(opts).finally(() => {
    behindCheckInflight = null
  })
  return behindCheckInflight
}

async function runBehindGoalNotificationCheckInner(opts: {
  getMessage: (count: number) => { title: string; body: string }
  force?: boolean
}): Promise<{ shown: boolean; reason: BehindNotifyReason }> {
  if (!getGoalsBehindNotifyEnabled()) {
    return { shown: false, reason: 'disabled' }
  }
  if (!prefersInAppGoalsBehindReminder()) {
    if (typeof Notification === 'undefined') {
      return { shown: false, reason: 'error' }
    }
    if (Notification.permission !== 'granted') {
      return { shown: false, reason: 'no-permission' }
    }
  }

  const today = todayCalendarDayInCheckinTz()
  try {
    if (!opts.force && localStorage.getItem(STORAGE_LAST_NOTIFY_DAY_KEY) === today) {
      return { shown: false, reason: 'already-today' }
    }
  } catch {
    /* ignore storage */
  }

  let rows
  try {
    rows = await listLearningGoals()
  } catch {
    return { shown: false, reason: 'error' }
  }

  const behind = rows.filter((g) => g.behind_pace === true)
  if (behind.length === 0) {
    return { shown: false, reason: 'no-behind' }
  }

  const { title, body } = opts.getMessage(behind.length)

  await deliverBehindReminder(title, body, behind.length)

  try {
    localStorage.setItem(STORAGE_LAST_NOTIFY_DAY_KEY, today)
  } catch {
    /* ignore */
  }

  return { shown: true, reason: 'shown' }
}

export type RunTestBehindNotifyResult = {
  shown: boolean
  reason: BehindNotifyReason | 'unsupported'
  /** Present when reason is `"error"` (often a failed `/api/learning-goals` request). */
  detail?: string
}

/** One-shot test: does not require the setting to be on; does not advance the daily dedupe cursor. */
export async function runTestBehindGoalNotification(opts: {
  getMessage: (count: number) => { title: string; body: string }
}): Promise<RunTestBehindNotifyResult> {
  if (!prefersInAppGoalsBehindReminder()) {
    if (typeof Notification === 'undefined') {
      return { shown: false, reason: 'unsupported' }
    }
    if (Notification.permission !== 'granted') {
      return { shown: false, reason: 'no-permission' }
    }
  }

  let rows
  try {
    rows = await listLearningGoals()
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e)
    return { shown: false, reason: 'error', detail }
  }

  const behind = rows.filter((g) => g.behind_pace === true)
  if (behind.length === 0) {
    return { shown: false, reason: 'no-behind' }
  }

  const { title, body } = opts.getMessage(behind.length)

  await deliverBehindReminder(title, body, behind.length)

  return { shown: true, reason: 'shown' }
}
