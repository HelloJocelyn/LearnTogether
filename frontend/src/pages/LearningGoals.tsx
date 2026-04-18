import { type FormEvent, useCallback, useEffect, useState } from 'react'

import {
  createLearningGoal,
  deleteLearningGoal,
  listLearningGoals,
  updateLearningGoal,
  type LearningGoal,
} from '../api'
import { useI18n } from '../i18n'

function nonNegInt(value: string): number {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** Both are YYYY-MM-DD or empty; if both set, start must be <= end. */
function datesInOrder(start: string, end: string): boolean {
  const s = start.trim()
  const e = end.trim()
  if (s === '' || e === '') return true
  return s <= e
}

/** Same formula as backend `derive_learning_goal_progress`. */
function progressFromUnits(totalUnits: number, completeUnits: number): number {
  if (totalUnits <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((completeUnits * 100) / totalUnits)))
}

function IconEdit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function GoalRow({
  goal,
  onRefresh,
}: {
  goal: LearningGoal
  onRefresh: () => Promise<void>
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(goal.name)
  const [progress, setProgress] = useState(goal.progress)
  const [totalUnits, setTotalUnits] = useState(goal.total_units)
  const [completeUnits, setCompleteUnits] = useState(goal.complete_units)
  const [startDate, setStartDate] = useState(goal.start_date ?? '')
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [saving, setSaving] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setName(goal.name)
    setProgress(goal.progress)
    setTotalUnits(goal.total_units)
    setCompleteUnits(goal.complete_units)
    setStartDate(goal.start_date ?? '')
    setDeadline(goal.deadline ?? '')
  }, [
    goal.id,
    goal.name,
    goal.progress,
    goal.total_units,
    goal.complete_units,
    goal.start_date,
    goal.deadline,
  ])

  useEffect(() => {
    if (totalUnits > 0) {
      setProgress(progressFromUnits(totalUnits, completeUnits))
    }
  }, [totalUnits, completeUnits])

  function discardEdit() {
    setName(goal.name)
    setProgress(goal.progress)
    setTotalUnits(goal.total_units)
    setCompleteUnits(goal.complete_units)
    setStartDate(goal.start_date ?? '')
    setDeadline(goal.deadline ?? '')
    setMsg(null)
    setEditing(false)
  }

  async function onApply(e: FormEvent) {
    e.preventDefault()
    if (totalUnits > 0 && completeUnits > totalUnits) {
      setMsg(t('goals.unitsMismatch'))
      return
    }
    if (!datesInOrder(startDate, deadline)) {
      setMsg(t('goals.dateOrderError'))
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const payload: {
        name?: string
        progress?: number
        total_units?: number
        complete_units?: number
        start_date?: string | null
        deadline?: string | null
      } = {}
      const derivedProgress =
        totalUnits > 0 ? progressFromUnits(totalUnits, completeUnits) : progress
      if (name.trim() !== goal.name) payload.name = name.trim()
      if (derivedProgress !== goal.progress) payload.progress = derivedProgress
      if (totalUnits !== goal.total_units) payload.total_units = totalUnits
      if (completeUnits !== goal.complete_units) payload.complete_units = completeUnits
      const prevS = goal.start_date ?? ''
      const nextS = startDate.trim()
      if (prevS !== nextS) {
        payload.start_date = nextS === '' ? null : nextS
      }
      const prevD = goal.deadline ?? ''
      const nextD = deadline.trim()
      if (prevD !== nextD) {
        payload.deadline = nextD === '' ? null : nextD
      }
      if (Object.keys(payload).length === 0) {
        setMsg(t('goals.nothingToSave'))
      } else {
        await updateLearningGoal(goal.id, payload)
        await onRefresh()
        setEditing(false)
      }
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function onRemove() {
    setRemoveBusy(true)
    setMsg(null)
    try {
      await deleteLearningGoal(goal.id)
      await onRefresh()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setRemoveBusy(false)
    }
  }

  const unitsLabel = `${goal.complete_units} / ${goal.total_units}`

  return (
    <li className="rowItem goalRow">
      {!editing ? (
        <div className="goalRowLayout">
          <div className="goalRowSummary">
            <div className="goalSummaryTitleRow">
              <div className="goalSummaryName">{goal.name}</div>
              {goal.behind_pace ? (
                <span
                  className="goalAlertBadge"
                  title={t('goals.behindScheduleDetail', {
                    expected: goal.expected_units_pace ?? '—',
                    complete: goal.complete_units,
                  })}
                >
                  {t('goals.behindScheduleFull')}
                </span>
              ) : null}
            </div>
            <div className="goalSummaryMeta muted">
              <span>{goal.progress}%</span>
              <span className="goalSummarySep" aria-hidden>
                ·
              </span>
              <span title={`${t('goals.completeUnits')} / ${t('goals.totalUnits')}`}>{unitsLabel}</span>
              <span className="goalSummarySep" aria-hidden>
                ·
              </span>
              <span title={t('goals.startDate')}>{goal.start_date ?? '—'}</span>
              <span className="goalSummarySep" aria-hidden>
                ·
              </span>
              <span title={t('goals.deadline')}>{goal.deadline ?? '—'}</span>
            </div>
          </div>
          <div className="goalRowToolIcons">
            <button
              type="button"
              className="goalIconBtn"
              onClick={() => {
                setMsg(null)
                setEditing(true)
              }}
              aria-label={t('goals.edit')}
              title={t('goals.edit')}
            >
              <IconEdit />
            </button>
            <button
              type="button"
              className="goalIconBtn goalIconBtnDanger"
              disabled={removeBusy}
              onClick={onRemove}
              aria-label={t('goals.delete')}
              title={t('goals.delete')}
            >
              <IconTrash />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onApply} className="goalRowForm goalRowEditWrap">
          <div className="goalRowEditBody">
            <div className="goalRowFields">
              <label className="goalLabel">
                <span className="muted smallLabel">{t('goals.name')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
              </label>
              <label className="goalLabel">
                <span className="muted smallLabel">{t('goals.totalUnits')}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={totalUnits}
                  onChange={(e) => setTotalUnits(nonNegInt(e.target.value))}
                />
              </label>
              <label className="goalLabel">
                <span className="muted smallLabel">{t('goals.completeUnits')}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={completeUnits}
                  onChange={(e) => setCompleteUnits(nonNegInt(e.target.value))}
                />
              </label>
              <label className="goalLabel">
                <span className="muted smallLabel">
                  {t('goals.progress')}
                  {totalUnits > 0 ? (
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                      ({t('goals.progressFromUnits')})
                    </span>
                  ) : null}
                </span>
                {totalUnits > 0 ? (
                  <div className="goalProgressDerived">
                    <span className="goalProgressPct">{progress}%</span>
                    <span className="muted" style={{ marginLeft: 8 }}>
                      ({completeUnits}/{totalUnits})
                    </span>
                  </div>
                ) : (
                  <span className="goalProgressWrap">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                      aria-label={t('goals.progress')}
                    />
                    <span className="goalProgressPct">{progress}%</span>
                  </span>
                )}
              </label>
              <label className="goalLabel">
                <span className="muted smallLabel">{t('goals.startDate')}</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="goalLabel">
                <span className="muted smallLabel">{t('goals.deadline')}</span>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </label>
            </div>
          </div>
          <div className="goalRowToolIcons goalRowToolIconsEdit">
            <button
              type="submit"
              className="goalIconBtn goalIconBtnPrimary"
              disabled={saving || !name.trim()}
              aria-label={t('goals.applyChanges')}
              title={t('goals.applyChanges')}
            >
              <IconCheck />
            </button>
            <button
              type="button"
              className="goalIconBtn"
              disabled={saving}
              onClick={discardEdit}
              aria-label={t('goals.discardChanges')}
              title={t('goals.discardChanges')}
            >
              <IconClose />
            </button>
          </div>
        </form>
      )}
      {msg ? <p className="error goalRowMsg">{msg}</p> : null}
    </li>
  )
}

export default function LearningGoals() {
  const { t } = useI18n()
  const [goals, setGoals] = useState<LearningGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newProgress, setNewProgress] = useState(0)
  const [newTotalUnits, setNewTotalUnits] = useState(0)
  const [newCompleteUnits, setNewCompleteUnits] = useState(0)
  const [newStartDate, setNewStartDate] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (newTotalUnits > 0) {
      setNewProgress(progressFromUnits(newTotalUnits, newCompleteUnits))
    }
  }, [newTotalUnits, newCompleteUnits])

  const refresh = useCallback(async () => {
    try {
      const rows = await listLearningGoals()
      setGoals(rows)
      setError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('403')) {
        setError(t('goals.errorEdition'))
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const n = newName.trim()
    if (!n) return
    if (newTotalUnits > 0 && newCompleteUnits > newTotalUnits) {
      setError(t('goals.unitsMismatch'))
      return
    }
    if (!datesInOrder(newStartDate, newDeadline)) {
      setError(t('goals.dateOrderError'))
      return
    }
    setAdding(true)
    setError(null)
    try {
      await createLearningGoal({
        name: n,
        progress: newProgress,
        total_units: newTotalUnits,
        complete_units: newCompleteUnits,
        start_date: newStartDate.trim() === '' ? null : newStartDate.trim(),
        deadline: newDeadline.trim() === '' ? null : newDeadline.trim(),
      })
      setNewName('')
      setNewProgress(0)
      setNewTotalUnits(0)
      setNewCompleteUnits(0)
      setNewStartDate('')
      setNewDeadline('')
      await refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('403')) {
        setError(t('goals.errorEdition'))
      } else {
        setError(msg)
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="page">
      <main className="main goalsMain">
        <section className="card goalsCard">
          <h2>{t('goals.title')}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {t('goals.desc')}
          </p>

          <form onSubmit={onAdd} className="row goalAddForm" style={{ marginTop: 16 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('goals.name')}
              maxLength={200}
            />
            <label className="goalAddUnits">
              <span className="muted smallLabel">{t('goals.totalUnits')}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={newTotalUnits}
                onChange={(e) => setNewTotalUnits(nonNegInt(e.target.value))}
              />
            </label>
            <label className="goalAddUnits">
              <span className="muted smallLabel">{t('goals.completeUnits')}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={newCompleteUnits}
                onChange={(e) => setNewCompleteUnits(nonNegInt(e.target.value))}
              />
            </label>
            <label className="goalAddProgress">
              <span className="muted smallLabel">
                {t('goals.progress')}
                {newTotalUnits > 0 ? (
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                    ({t('goals.progressFromUnits')})
                  </span>
                ) : null}
              </span>
              {newTotalUnits > 0 ? (
                <div className="goalProgressDerived">
                  <span className="goalProgressPct">{newProgress}%</span>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    ({newCompleteUnits}/{newTotalUnits})
                  </span>
                </div>
              ) : (
                <span className="goalProgressWrap">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={newProgress}
                    onChange={(e) => setNewProgress(Number(e.target.value))}
                    aria-label={t('goals.progress')}
                  />
                  <span className="goalProgressPct">{newProgress}%</span>
                </span>
              )}
            </label>
            <label className="goalAddUnits">
              <span className="muted smallLabel">{t('goals.startDate')}</span>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                aria-label={t('goals.startDate')}
              />
            </label>
            <input
              type="date"
              value={newDeadline}
              onChange={(e) => setNewDeadline(e.target.value)}
              aria-label={t('goals.deadline')}
            />
            <button type="submit" disabled={adding || newName.trim().length === 0}>
              {adding ? t('goals.adding') : t('goals.add')}
            </button>
          </form>

          {loading ? <p className="muted">{t('goals.loading')}</p> : null}
          {error ? <p className="error">{error}</p> : null}

          {!loading && !error ? (
            goals.length === 0 ? (
              <p className="muted" style={{ marginTop: 14 }}>
                {t('goals.none')}
              </p>
            ) : (
              <ul className="list dayList" style={{ marginTop: 14 }}>
                {goals.map((g) => (
                  <GoalRow key={g.id} goal={g} onRefresh={refresh} />
                ))}
              </ul>
            )
          ) : null}
        </section>
      </main>
    </div>
  )
}
