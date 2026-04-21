import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  apiBaseUrl,
  createBadge,
  createMember,
  deleteBadge,
  deleteMember,
  listBadges,
  listMembers,
  updateBadge,
  type AchievementBadge,
  type Member,
} from '../api'
import { useI18n } from '../i18n'
import { avatarFor } from '../avatar'

function resolveBadgeCertSrc(b: AchievementBadge): string | null {
  const raw = b.certificate_image_url?.trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const prefix = apiBaseUrl()
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return prefix ? `${prefix}${path}` : path
}

function sortBadgesByDateDesc(rows: AchievementBadge[]) {
  return [...rows].sort((a, b) => {
    if (a.earned_date_local !== b.earned_date_local) {
      return b.earned_date_local.localeCompare(a.earned_date_local)
    }
    return b.id - a.id
  })
}

function memberDisplayName(m: Member): string {
  return `${m.name} ${m.role} ${m.goal}`.trim()
}

export default function Members() {
  const { t } = useI18n()
  const [members, setMembers] = useState<Member[]>([])
  const [badges, setBadges] = useState<AchievementBadge[]>([])
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')
  const [newMemberGoal, setNewMemberGoal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [badgeNickname, setBadgeNickname] = useState('')
  const [badgeTitle, setBadgeTitle] = useState('')
  const [badgeDate, setBadgeDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [badgeSaving, setBadgeSaving] = useState(false)
  const [badgeError, setBadgeError] = useState<string | null>(null)
  const [badgeMemberId, setBadgeMemberId] = useState('')
  const [badgeCertFile, setBadgeCertFile] = useState<File | null>(null)
  const [certInputKey, setCertInputKey] = useState(0)
  const [badgeEditMode, setBadgeEditMode] = useState(false)
  const [editingBadgeId, setEditingBadgeId] = useState<number | null>(null)

  function refreshBadges() {
    return listBadges({ limit: 500 })
      .then(setBadges)
      .catch((e: unknown) => setBadgeError(e instanceof Error ? e.message : String(e)))
  }

  function loadAll() {
    return Promise.all([listMembers(), listBadges({ limit: 500 })]).then(([m, b]) => {
      setMembers(m)
      setBadges(b)
    })
  }

  useEffect(() => {
    loadAll().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const memberNameSet = useMemo(() => new Set(members.map((m) => memberDisplayName(m))), [members])

  const { badgesByMember, unlinkedBadges } = useMemo(() => {
    const byMember = new Map<number, AchievementBadge[]>()
    for (const m of members) {
      const rows = badges.filter(
        (b) => b.member_id === m.id || (b.member_id == null && b.nickname === memberDisplayName(m))
      )
      byMember.set(m.id, sortBadgesByDateDesc(rows))
    }
    const unlinked = sortBadgesByDateDesc(
      badges.filter((b) => b.member_id == null && !memberNameSet.has(b.nickname))
    )
    return { badgesByMember: byMember, unlinkedBadges: unlinked }
  }, [badges, members, memberNameSet])

  const membersWithBadges = useMemo(
    () => members.filter((m) => (badgesByMember.get(m.id) ?? []).length > 0),
    [members, badgesByMember],
  )

  async function onAddMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newMemberName.trim()
    const role = newMemberRole.trim()
    const goal = newMemberGoal.trim()
    if (!name || !role || !goal) {
      setError(t('members.memberFieldsRequired'))
      return
    }
    setError(null)
    try {
      const member = await createMember(name, role, goal)
      setMembers((prev) => {
        const exists = prev.find((m) => m.id === member.id)
        if (exists) return prev
        return [...prev, member].sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)))
      })
      setNewMemberName('')
      setNewMemberRole('')
      setNewMemberGoal('')
      await refreshBadges()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDeleteMember(id: number) {
    setError(null)
    try {
      await deleteMember(id)
      setMembers((prev) => prev.filter((m) => m.id !== id))
      await refreshBadges()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onSubmitBadge(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBadgeSaving(true)
    setBadgeError(null)
    const mid = badgeMemberId === '' ? undefined : Number(badgeMemberId)
    if (mid == null && !badgeNickname.trim()) {
      setBadgeError(t('settings.badgeNicknameRequired'))
      setBadgeSaving(false)
      return
    }
    try {
      if (editingBadgeId != null) {
        await updateBadge(editingBadgeId, {
          title: badgeTitle.trim(),
          earnedDate: badgeDate,
          memberId: mid,
          nickname: badgeNickname.trim(),
          certificate: badgeCertFile,
        })
      } else {
        await createBadge({
          title: badgeTitle.trim(),
          earnedDate: badgeDate,
          memberId: mid,
          nickname: badgeNickname.trim(),
          certificate: badgeCertFile,
        })
      }
      setBadgeTitle('')
      setBadgeNickname('')
      setBadgeMemberId('')
      setEditingBadgeId(null)
      setBadgeCertFile(null)
      setCertInputKey((k) => k + 1)
      await refreshBadges()
    } catch (err: unknown) {
      setBadgeError(err instanceof Error ? err.message : String(err))
    } finally {
      setBadgeSaving(false)
    }
  }

  function onPickBadgeForEdit(b: AchievementBadge) {
    if (!badgeEditMode) return
    setEditingBadgeId(b.id)
    if (b.member_id != null) {
      setBadgeMemberId(String(b.member_id))
      const member = members.find((m) => m.id === b.member_id)
      setBadgeNickname(member ? memberDisplayName(member) : b.nickname)
    } else {
      setBadgeMemberId('')
      setBadgeNickname(b.nickname)
    }
    setBadgeTitle(b.title)
    setBadgeDate(b.earned_date_local)
    setBadgeCertFile(null)
    setCertInputKey((k) => k + 1)
  }

  function onCancelEditBadge() {
    setEditingBadgeId(null)
    setBadgeMemberId('')
    setBadgeNickname('')
    setBadgeTitle('')
    setBadgeCertFile(null)
    setCertInputKey((k) => k + 1)
  }

  async function onRemoveBadge(id: number) {
    setBadgeError(null)
    try {
      await deleteBadge(id)
      await refreshBadges()
    } catch (err: unknown) {
      setBadgeError(err instanceof Error ? err.message : String(err))
    }
  }

  function renderBadgeRow(b: AchievementBadge) {
    const certSrc = resolveBadgeCertSrc(b)
    const isEditingTarget = editingBadgeId === b.id
    const badgeCircleInner = (
      <div className="badgeCircleInner">
        <div className="badgeCircleIcon" aria-hidden="true">
          🏅
        </div>
        <div className="badgeCircleTitle">{b.title}</div>
        <div className="badgeCircleDate">{b.earned_date_local}</div>
      </div>
    )
    return (
      <li key={b.id} className={`badgeCard${isEditingTarget ? ' badgeCardEditing' : ''}`}>
        {certSrc ? (
          <a
            className="badgeCircle"
            href={certSrc}
            target="_blank"
            rel="noreferrer"
            title={t('settings.badgeOpenCertificate')}
            onClick={(e) => {
              if (badgeEditMode) {
                e.preventDefault()
                onPickBadgeForEdit(b)
              }
            }}
          >
            {badgeCircleInner}
          </a>
        ) : (
          <button type="button" className="badgeCircle" onClick={() => onPickBadgeForEdit(b)}>
            {badgeCircleInner}
          </button>
        )}
        {certSrc ? (
          <a
            className="badgeCertThumbWrap"
            href={certSrc}
            target="_blank"
            rel="noreferrer"
            title={t('settings.badgeOpenCertificate')}
            onClick={(e) => {
              if (badgeEditMode) {
                e.preventDefault()
                onPickBadgeForEdit(b)
              }
            }}
          >
            <img src={certSrc} alt="" className="badgeCertThumb" />
          </a>
        ) : null}
        {badgeEditMode ? (
          <button
            type="button"
            className="secondary badgeRemoveIconBtn"
            onClick={() => onRemoveBadge(b.id)}
            aria-label={t('settings.badgeRemove')}
            title={t('settings.badgeRemove')}
          >
            ✕
          </button>
        ) : null}
      </li>
    )
  }

  return (
    <div className="page">
      <main className="main membersMain">
        <section className="card membersCard membersCardMembers">
          <div className="titleRow">
            <h2 style={{ marginBottom: 0 }}>{t('members.title')}</h2>
            <span className="muted membersMemberCount">{t('members.memberCount', { count: members.length })}</span>
          </div>

          <div className="membersSubSection membersSubSectionSplit">
            {members.length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>
                {t('members.none')}
              </p>
            ) : (
              <div className="membersListScroll">
                <ul className="list dayList" style={{ marginTop: 10 }}>
                  {members.map((m) => {
                    const av = avatarFor(m.name)
                    return (
                    <li key={m.id} className="rowItem">
                      <span className="avatar avatarGrey" aria-hidden="true" style={{ background: av.bg }}>
                        {av.initials}
                      </span>
                      <div className="rowText" style={{ flex: 1 }}>
                        <div className="rowTop">
                          <strong>{memberDisplayName(m)}</strong>
                          <button
                            type="button"
                            className="secondary memberRemoveIconBtn"
                            onClick={() => onDeleteMember(m.id)}
                            aria-label={t('members.remove')}
                            title={t('members.remove')}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="membersSubSection membersSubSectionSplit">
            <form onSubmit={onAddMember} className="row">
              <input
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder={t('members.nameLabel')}
              />
              <input
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value)}
                placeholder={t('members.roleLabel')}
              />
              <input
                value={newMemberGoal}
                onChange={(e) => setNewMemberGoal(e.target.value)}
                placeholder={t('members.goalLabel')}
              />
              <button
                type="submit"
                disabled={
                  newMemberName.trim().length === 0 ||
                  newMemberRole.trim().length === 0 ||
                  newMemberGoal.trim().length === 0
                }
              >
                {t('members.add')}
              </button>
            </form>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="card membersCard membersCardBadges">
          <div className="rowTop">
            <h2 style={{ marginBottom: 0 }}>{t('members.badgesSectionTitle')}</h2>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setBadgeEditMode((v) => {
                  const next = !v
                  if (!next) onCancelEditBadge()
                  return next
                })
              }}
            >
              {badgeEditMode ? t('members.badgesDone') : t('members.badgesEdit')}
            </button>
          </div>

          <div className="membersSubSection">
            {membersWithBadges.length === 0 && unlinkedBadges.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                {t('settings.badgeEmpty')}
              </p>
            ) : null}

            <div className="membersBadgesListPanel">
              {membersWithBadges.map((m, index) => {
                const list = badgesByMember.get(m.id) ?? []
                const av = avatarFor(memberDisplayName(m))
                return (
                  <div key={m.id} className={`memberBadgeGroup${index === 0 ? ' memberBadgeGroupFirst' : ''}`}>
                    <div className="memberBadgeGroupHeader">
                      <span className="avatar avatarGrey" aria-hidden="true" style={{ background: av.bg }}>
                        {av.initials}
                      </span>
                      <h3 className="memberBadgeGroupTitle">{memberDisplayName(m)}</h3>
                    </div>
                    <ul className="list dayList membersBadgeGrid" style={{ marginTop: 8 }}>
                      {list.map((b) => renderBadgeRow(b))}
                    </ul>
                  </div>
                )
              })}

              {unlinkedBadges.length > 0 ? (
                <div className="memberBadgeGroup" style={{ marginTop: 20 }}>
                  <h3 className="memberBadgeGroupTitle">{t('members.badgesUnlinkedTitle')}</h3>
                  <ul className="list dayList membersBadgeGrid" style={{ marginTop: 8 }}>
                    {unlinkedBadges.map((b) => renderBadgeRow(b))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="membersSubSection membersSubSectionSplit">
              <form onSubmit={onSubmitBadge} className="quickJoinForm badgeUpdateForm" style={{ marginTop: 12 }}>
                <label className="label badgeFullRow">
                  {t('settings.badgeMemberOptional')}
                  <select
                    value={badgeMemberId}
                    onChange={(e) => {
                      setBadgeMemberId(e.target.value)
                      const m = members.find((x) => String(x.id) === e.target.value)
                      if (m) setBadgeNickname(memberDisplayName(m))
                    }}
                  >
                    <option value="">{t('settings.badgeMemberNone')}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {memberDisplayName(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="label">
                  {t('settings.badgeNickname')}
                  <input
                    type="text"
                    value={badgeNickname}
                    onChange={(e) => setBadgeNickname(e.target.value)}
                    placeholder="alex student react"
                    required={badgeMemberId === ''}
                    disabled={badgeMemberId !== ''}
                    autoComplete="off"
                  />
                </label>
                <label className="label">
                  {t('settings.badgeTitleLabel')}
                  <input
                    type="text"
                    value={badgeTitle}
                    onChange={(e) => setBadgeTitle(e.target.value)}
                    placeholder={t('settings.badgeTitlePlaceholder')}
                    required
                    autoComplete="off"
                  />
                </label>
                <label className="label">
                  {t('settings.badgeDate')}
                  <input type="date" value={badgeDate} onChange={(e) => setBadgeDate(e.target.value)} required />
                </label>
                <label className="label">
                  {t('settings.badgeCertificate')}
                  <input
                    key={certInputKey}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => setBadgeCertFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button type="submit" disabled={badgeSaving}>
                  {badgeSaving
                    ? t('settings.badgeAdding')
                    : editingBadgeId != null
                      ? t('members.badgesSaveChanges')
                      : t('settings.badgeAdd')}
                </button>
                {editingBadgeId != null ? (
                  <button type="button" className="secondary" onClick={onCancelEditBadge}>
                    {t('members.badgesCancelEdit')}
                  </button>
                ) : null}
              </form>
              {badgeError ? <p className="error">{badgeError}</p> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
