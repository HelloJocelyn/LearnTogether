import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  GOALS_BEHIND_REMIND_EVENT,
  type GoalsBehindRemindDetail,
} from '../goalBehindNotifications'
import { useI18n } from '../i18n'

export function GoalsBehindInAppBanner() {
  const { t } = useI18n()
  const [payload, setPayload] = useState<GoalsBehindRemindDetail | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<GoalsBehindRemindDetail>).detail
      if (d?.title) setPayload(d)
    }
    window.addEventListener(GOALS_BEHIND_REMIND_EVENT, handler as EventListener)
    return () => window.removeEventListener(GOALS_BEHIND_REMIND_EVENT, handler as EventListener)
  }, [])

  if (!payload) return null

  return (
    <div className="goalsBehindBanner" role="status">
      <div className="goalsBehindBannerInner">
        <div>
          <strong>{payload.title}</strong>
          <p className="goalsBehindBannerBody">{payload.body}</p>
        </div>
        <div className="goalsBehindBannerActions">
          <Link to="/learning-goals" className="secondary" onClick={() => setPayload(null)}>
            {t('notify.goalsBehindOpenGoals')}
          </Link>
          <button type="button" className="secondary" onClick={() => setPayload(null)}>
            {t('notify.goalsBehindDismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
