import { useEffect } from 'react'

import { useI18n } from '../i18n'
import { runBehindGoalNotificationCheck } from '../goalBehindNotifications'

const RECHECK_MS = 6 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 4000

export function GoalsBehindNotifyEffect() {
  const { t } = useI18n()

  useEffect(() => {
    const run = () => {
      void runBehindGoalNotificationCheck({
        getMessage: (count) => ({
          title: t('notify.goalsBehindTitle'),
          body: t('notify.goalsBehindBody', { count }),
        }),
      })
    }

    const initial = window.setTimeout(run, INITIAL_DELAY_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVis)
    const interval = window.setInterval(run, RECHECK_MS)

    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [t])

  return null
}
