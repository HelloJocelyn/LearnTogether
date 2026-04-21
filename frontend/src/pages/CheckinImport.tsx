import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { importCheckinsFromCsv, type CheckinCsvImportResult } from '../api'
import { useI18n } from '../i18n'

export default function CheckinImport() {
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [defaultYear, setDefaultYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckinCsvImportResult | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const yearRaw = defaultYear.trim()
      const year =
        yearRaw === ''
          ? undefined
          : Number.parseInt(yearRaw, 10)
      if (yearRaw !== '' && Number.isNaN(year)) {
        setError(t('checkinImport.invalidYear'))
        setLoading(false)
        return
      }
      const data = await importCheckinsFromCsv(file, year)
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = file !== null && !loading

  return (
    <div className="page">
      <header className="header">
        <div className="titleRow">
          <h1 className="title">{t('checkinImport.title')}</h1>
          <span className="tagline">{t('checkinImport.tagline')}</span>
        </div>
        <div className="muted">
          <Link to="/">{t('common.back')}</Link>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <p className="muted">{t('checkinImport.desc')}</p>
          <form onSubmit={onSubmit}>
            <div className="row" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <label>
                <span className="muted" style={{ marginRight: 8 }}>
                  {t('checkinImport.file')}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    setResult(null)
                    setError(null)
                  }}
                />
              </label>
              <label>
                <span className="muted" style={{ marginRight: 8 }}>
                  {t('checkinImport.defaultYear')}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('checkinImport.yearPlaceholder')}
                  value={defaultYear}
                  onChange={(e) => setDefaultYear(e.target.value)}
                  style={{ width: 100 }}
                />
              </label>
              <button type="submit" disabled={!canSubmit}>
                {loading ? t('checkinImport.uploading') : t('checkinImport.submit')}
              </button>
            </div>
          </form>
        </section>

        {error ? <p className="error">{error}</p> : null}

        {result ? (
          <section className="card">
            <h2>{t('checkinImport.resultTitle')}</h2>
            <ul className="muted" style={{ lineHeight: 1.7 }}>
              <li>{t('checkinImport.resultFile', { name: result.filename })}</li>
              <li>{t('checkinImport.resultYear', { year: result.resolved_year })}</li>
              <li>{t('checkinImport.resultParsed', { n: result.parsed_cells })}</li>
              <li>{t('checkinImport.resultCreated', { n: result.created })}</li>
              <li>{t('checkinImport.resultReplaced', { n: result.replaced })}</li>
              <li>{t('checkinImport.resultMembersAdded', { n: result.members_added })}</li>
              <li>{t('checkinImport.resultMembersReactivated', { n: result.members_reactivated })}</li>
              <li>
                {t('checkinImport.resultMembersAlreadyActive', { n: result.members_already_active })}
              </li>
              <li>
                {t('checkinImport.resultSkippedUnknown', { n: result.skipped_unknown_status_cells })}
              </li>
            </ul>
            {result.parse_warnings.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <strong>{t('checkinImport.warnings')}</strong>
                <ul className="error" style={{ marginTop: 8 }}>
                  {result.parse_warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}
