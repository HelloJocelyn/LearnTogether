import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  confirmAttendanceImport,
  createAttendanceImportFromImage,
  type AttendanceImport,
  type AttendanceImportItem,
  type AttendanceStatus,
  updateAttendanceImportItems,
} from '../api'
import { useI18n } from '../i18n'

type EditableRow = {
  localId: string
  id?: number
  name: string
  attendance_status: AttendanceStatus
  confidence?: number
  is_edited?: boolean
}

function toRows(items: AttendanceImportItem[]): EditableRow[] {
  return items.map((item) => ({
    localId: `server-${item.id}`,
    id: item.id,
    name: item.name,
    attendance_status: item.attendance_status,
    confidence: item.confidence,
    is_edited: item.is_edited,
  }))
}

function statusLabel(
  status: AttendanceStatus,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (status === 'attended') return t('import.status.attended')
  if (status === 'not_attended') return t('import.status.notAttended')
  return t('import.status.unknown')
}

export default function AttendanceImport() {
  const { t } = useI18n()
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState<string | null>(null)
  const [importInfo, setImportInfo] = useState<AttendanceImport | null>(null)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<string | null>(null)

  const importId = importInfo?.id ?? null
  const canUpload = sourceFile !== null && !loading

  const invalidRows = useMemo(
    () => rows.filter((row) => row.name.trim().length === 0).length,
    [rows]
  )
  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1
        acc[row.attendance_status] += 1
        return acc
      },
      { total: 0, attended: 0, not_attended: 0, unknown: 0 }
    )
  }, [rows])

  async function onRunMockOcr() {
    if (!sourceFile) return
    setLoading(true)
    setError(null)
    setSaveState(null)
    try {
      const data = await createAttendanceImportFromImage(sourceFile)
      setImportInfo(data.import_info)
      setRows(toRows(data.items))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function onSelectFile(file: File | null) {
    setSourceFile(file)
    setImportInfo(null)
    setRows([])
    setSaveState(null)
    setError(null)
    if (!file) {
      setSourcePreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setSourcePreview(url)
  }

  function updateRow(localId: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)))
  }

  function removeRow(localId: string) {
    setRows((prev) => prev.filter((row) => row.localId !== localId))
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        localId: `new-${crypto.randomUUID()}`,
        name: '',
        attendance_status: 'unknown',
      },
    ])
  }

  async function onSaveDraft() {
    if (!importId) return
    if (invalidRows > 0) {
      setError(t('import.fillNamesSaving'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const updated = await updateAttendanceImportItems(
        importId,
        rows.map((row) => ({
          id: row.id,
          name: row.name.trim(),
          attendance_status: row.attendance_status,
        }))
      )
      setRows(toRows(updated))
      setSaveState(t('import.draftSaved'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function onConfirm() {
    if (!importId) return
    if (invalidRows > 0) {
      setError(t('import.fillNamesConfirming'))
      return
    }
    setLoading(true)
    setError(null)
    setSaveState(null)
    try {
      const updated = await updateAttendanceImportItems(
        importId,
        rows.map((row) => ({
          id: row.id,
          name: row.name.trim(),
          attendance_status: row.attendance_status,
        }))
      )
      setRows(toRows(updated))
      const result = await confirmAttendanceImport(importId)
      setImportInfo((prev) => (prev ? { ...prev, status: result.status } : prev))
      setSaveState(
        t('import.confirmedSummary', {
          total: result.total,
          attended: result.attended,
          notAttended: result.not_attended,
          unknown: result.unknown,
        })
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const disableEdit = importInfo?.status === 'confirmed'

  return (
    <div className="page">
      <header className="header">
        <div className="titleRow">
          <h1 className="title">{t('import.title')}</h1>
          <span className="tagline">{t('import.tagline')}</span>
        </div>
        <div className="muted">
          <Link to="/">{t('common.back')}</Link>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <h2>{t('import.step1')}</h2>
          <p className="muted">
            {t('import.step1Desc')}
          </p>
          <div className="row">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" onClick={onRunMockOcr} disabled={!canUpload}>
              {loading ? t('import.processing') : t('import.runMock')}
            </button>
          </div>
          {sourcePreview ? (
            <div className="importPreviewWrap">
              <img src={sourcePreview} alt={t('import.sourceAlt')} className="importPreview" />
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2>{t('import.step2')}</h2>
          <div className="importSummary">
            <span>{t('import.total', { count: summary.total })}</span>
            <span>{t('import.attended', { count: summary.attended })}</span>
            <span>{t('import.notAttended', { count: summary.not_attended })}</span>
            <span>{t('import.unknown', { count: summary.unknown })}</span>
            {importInfo ? <span>{t('import.status', { status: importInfo.status })}</span> : null}
          </div>
          {rows.length === 0 ? (
            <p className="muted">{t('import.noRows')}</p>
          ) : (
            <div className="importTableWrap">
              <table className="importTable">
                <thead>
                  <tr>
                    <th>{t('import.col.name')}</th>
                    <th>{t('import.col.status')}</th>
                    <th>{t('import.col.confidence')}</th>
                    <th>{t('import.col.edited')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.localId}>
                      <td>
                        <input
                          value={row.name}
                          onChange={(e) => updateRow(row.localId, { name: e.target.value })}
                          disabled={disableEdit}
                        />
                      </td>
                      <td>
                        <select
                          value={row.attendance_status}
                          onChange={(e) =>
                            updateRow(row.localId, {
                              attendance_status: e.target.value as AttendanceStatus,
                            })
                          }
                          disabled={disableEdit}
                        >
                          <option value="attended">{statusLabel('attended', t)}</option>
                          <option value="not_attended">{statusLabel('not_attended', t)}</option>
                          <option value="unknown">{statusLabel('unknown', t)}</option>
                        </select>
                      </td>
                      <td>{typeof row.confidence === 'number' ? `${row.confidence}%` : '-'}</td>
                      <td>{row.is_edited ? t('import.yes') : t('import.no')}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => removeRow(row.localId)}
                          disabled={disableEdit}
                        >
                          {t('import.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="row">
            <button type="button" className="secondary" onClick={addRow} disabled={disableEdit}>
              {t('import.addRow')}
            </button>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={loading || rows.length === 0 || disableEdit}
            >
              {t('import.saveDraft')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading || rows.length === 0 || disableEdit}
            >
              {t('import.confirmStore')}
            </button>
          </div>
          {invalidRows > 0 ? <p className="error">{t('import.invalidRows', { count: invalidRows })}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {saveState ? <p className="muted">{saveState}</p> : null}
        </section>
      </main>
    </div>
  )
}
