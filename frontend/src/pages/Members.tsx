import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  apiBaseUrl,
  createBadge,
  createMember,
  deleteBadge,
  deleteMember,
  listBadges,
  listMembers,
  type AchievementBadge,
  type Member,
} from '../api'
import { useI18n } from '../i18n'

function hashString(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

function avatarFor(nickname: string) {
  const trimmed = nickname.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const initials =
    parts.length === 0
      ? '?'
      : parts.length === 1
        ? parts[0]!.slice(0, 2).toUpperCase()
        : (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()

  const h = hashString(trimmed.toLowerCase())
  const hue = h % 360
  const bg = `hsl(${hue} 70% 40%)`
  return { initials, bg }
}

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

export default function Members() {
  const { t } = useI18n()
  const [members, setMembers] = useState<Member[]>([])
  const [badges, setBadges] = useState<AchievementBadge[]>([])
  const [newMemberName, setNewMemberName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const formatHint = 'nickname role goal'

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

  const memberNameSet = useMemo(() => new Set(members.map((m) => m.name)), [members])

  const { badgesByMember, unlinkedBadges } = useMemo(() => {
    const byMember = new Map<number, AchievementBadge[]>()
    for (const m of members) {
      const rows = badges.filter(
        (b) => b.member_id === m.id || (b.member_id == null && b.nickname === m.name)
      )
      byMember.set(m.id, sortBadgesByDateDesc(rows))
    }
    const unlinked = sortBadgesByDateDesc(
      badges.filter((b) => b.member_id == null && !memberNameSet.has(b.nickname))
    )
    return { badgesByMember: byMember, unlinkedBadges: unlinked }
  }, [badges, members, memberNameSet])

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

  async function onAddBadge(e: FormEvent<HTMLFormElement>) {
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
      await createBadge({
        title: badgeTitle.trim(),
        earnedDate: badgeDate,
        memberId: mid,
        nickname: badgeNickname.trim(),
        certificate: badgeCertFile,
      })
      setBadgeTitle('')
      setBadgeCertFile(null)
      setCertInputKey((k) => k + 1)
      await refreshBadges()
    } catch (err: unknown) {
      setBadgeError(err instanceof Error ? err.message : String(err))
    } finally {
      setBadgeSaving(false)
    }
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
    const av = avatarFor(b.nickname)
    const certSrc = resolveBadgeCertSrc(b)
    return (
      <li key={b.id} className="rowItem">
        <span className="avatar avatarGrey" aria-hidden="true" style={{ background: av.bg }}>
          {av.initials}
        </span>
        <div className="rowText" style={{ flex: 1 }}>
          <div className="rowTop">
            <strong>{b.nickname}</strong>
            <span className="muted">{b.earned_date_local}</span>
          </div>
          <div>
            <span className="pill" style={{ background: 'rgba(234, 179, 8, 0.2)' }}>
              🏅 {b.title}
              {b.member_id != null ? (
                <span className="muted" style={{ marginLeft: 8 }}>
                  ({t('settings.badgeLinkedMember')})
                </span>
              ) : null}
            </span>
          </div>
        </div>
        {certSrc ? (
          <a
            className="badgeCertThumbWrap"
            href={certSrc}
            target="_blank"
            rel="noreferrer"
            title={t('settings.badgeOpenCertificate')}
          >
            <img src={certSrc} alt="" className="badgeCertThumb" />
          </a>
        ) : null}
        <button type="button" className="secondary" onClick={() => onRemoveBadge(b.id)}>
          {t('settings.badgeRemove')}
        </button>
      </li>
    )
  }

  return (
    <div className="page">
      <main className="main">
        <section className="card">
          <h2>{t('members.title')}</h2>
          <p className="muted">{t('members.desc')}</p>
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
                      <button type="button" className="secondary" onClick={() => onDeleteMember(m.id)}>
                        {t('members.remove')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>{t('members.badgesAddTitle')}</h2>
          <p className="muted">{t('members.badgesAddDesc')}</p>
          <form onSubmit={onAddBadge} className="quickJoinForm" style={{ marginTop: 12 }}>
            <label className="label">
              {t('settings.badgeMemberOptional')}
              <select
                value={badgeMemberId}
                onChange={(e) => {
                  setBadgeMemberId(e.target.value)
                  const m = members.find((x) => String(x.id) === e.target.value)
                  if (m) setBadgeNickname(m.name)
                }}
              >
                <option value="">{t('settings.badgeMemberNone')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
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
              {badgeSaving ? t('settings.badgeAdding') : t('settings.badgeAdd')}
            </button>
          </form>
          {badgeError ? <p className="error">{badgeError}</p> : null}
        </section>

        <section className="card">
          <h2>{t('members.badgesByMemberTitle')}</h2>
          <p className="muted">{t('members.badgesByMemberDesc')}</p>
          {members.length === 0 && unlinkedBadges.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              {t('settings.badgeEmpty')}
            </p>
          ) : null}

          {members.map((m, index) => {
            const list = badgesByMember.get(m.id) ?? []
            const av = avatarFor(m.name)
            return (
              <div key={m.id} className={`memberBadgeGroup${index === 0 ? ' memberBadgeGroupFirst' : ''}`}>
                <div className="memberBadgeGroupHeader">
                  <span className="avatar avatarGrey" aria-hidden="true" style={{ background: av.bg }}>
                    {av.initials}
                  </span>
                  <h3 className="memberBadgeGroupTitle">{m.name}</h3>
                </div>
                {list.length === 0 ? (
                  <p className="muted memberBadgeGroupEmpty">{t('members.noBadgesForMember')}</p>
                ) : (
                  <ul className="list dayList" style={{ marginTop: 8 }}>
                    {list.map((b) => renderBadgeRow(b))}
                  </ul>
                )}
              </div>
            )
          })}

          {unlinkedBadges.length > 0 ? (
            <div className="memberBadgeGroup" style={{ marginTop: 20 }}>
              <h3 className="memberBadgeGroupTitle">{t('members.badgesUnlinkedTitle')}</h3>
              <ul className="list dayList" style={{ marginTop: 8 }}>
                {unlinkedBadges.map((b) => renderBadgeRow(b))}
              </ul>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
