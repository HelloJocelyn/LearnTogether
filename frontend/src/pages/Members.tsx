import { type FormEvent, useEffect, useState } from 'react'

import { createMember, deleteMember, listMembers, type Member } from '../api'

export default function Members() {
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
      setError(`Name must be in format: "${formatHint}"`)
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
          <h2>Members</h2>
          <p className="muted">
            Add frequently used names here, then select them from Home quick check-in.
          </p>
          <p className="muted">Required format: "{formatHint}"</p>
          <form onSubmit={onAddMember} className="row">
            <input
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder='Add new member (e.g. "alex student react")'
            />
            <button type="submit" disabled={newMemberName.trim().length === 0}>
              Add
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          {members.length === 0 ? (
            <p className="muted" style={{ marginTop: 10 }}>
              No members yet.
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
                        Remove
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
