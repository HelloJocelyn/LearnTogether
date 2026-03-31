import { type FormEvent, useEffect, useState } from 'react'

import { createMember, deleteMember, listMembers, type Member } from '../api'
import { useI18n } from '../i18n'

export default function Members() {
  const { t } = useI18n()
  const [members, setMembers] = useState<Member[]>([])
  const [newMemberName, setNewMemberName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const formatHint = 'nickname role goal'

  useEffect(() => {
    listMembers()
      .then(setMembers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function onAddMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newMemberName.trim()
    if (!name) return
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length !== 3) {
      setError(t('members.nameFormatError', { format: formatHint }))
      return
    }
    setError(null)
    try {
      const member = await createMember(name)
      setMembers((prev) => {
        const exists = prev.find((m) => m.id === member.id)
        if (exists) return prev
        return [...prev, member].sort((a, b) => a.name.localeCompare(b.name))
      })
      setNewMemberName('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDeleteMember(id: number) {
    setError(null)
    try {
      await deleteMember(id)
      setMembers((prev) => prev.filter((m) => m.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="page">
      <main className="main">
        <section className="card">
          <h2>{t('members.title')}</h2>
          <p className="muted">
            {t('members.desc')}
          </p>
          <p className="muted">{t('members.requiredFormat', { format: formatHint })}</p>
          <form onSubmit={onAddMember} className="row">
            <input
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder={t('members.placeholder')}
            />
            <button type="submit" disabled={newMemberName.trim().length === 0}>
              {t('members.add')}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          {members.length === 0 ? (
            <p className="muted" style={{ marginTop: 10 }}>
              {t('members.none')}
            </p>
          ) : (
            <ul className="list dayList" style={{ marginTop: 10 }}>
              {members.map((m) => (
                <li key={m.id} className="rowItem">
                  <div className="rowText">
                    <div className="rowTop">
                      <strong>{m.name}</strong>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onDeleteMember(m.id)}
                      >
                        {t('members.remove')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
