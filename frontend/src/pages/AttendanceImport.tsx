import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  confirmAttendanceImport,
  createAttendanceImportFromCsv,
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
  roll_number?: number | null
  notes?: string | null
}

function toRows(items: AttendanceImportItem[]): EditableRow[] {
  return items.map((item) => ({
    localId: `server-${item.id}`,
    id: item.id,
    name: item.name,
    attendance_status: item.attendance_status,
    confidence: item.confidence,
    is_edited: item.is_edited,
    roll_number: item.roll_number ?? undefined,
    notes: item.notes ?? undefined,
  }))
}

function isCsvFile(file: File): boolean {
  const name = file.name?.toLowerCase() ?? ''
  const type = file.type ?? ''
  return type === 'text/csv' || type === 'application/vnd.ms-excel' || name.endsWith('.csv')
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
  async function onRunMockOcr() {
    if (!sourceFile) return
    setLoading(true)
    setError(null)
    setSaveState(null)
    try {
      const data = isCsvFile(sourceFile)
        ? await createAttendanceImportFromCsv(sourceFile)
        : await createAttendanceImportFromImage(sourceFile)
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
    if (isCsvFile(file)) {
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
        roll_number: undefined,
        notes: undefined,
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
      setSaveState(t('import.confirmedSummarySimple', { total: result.total }))
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
              accept="image/*,.csv,text/csv"
              capture="environment"
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" onClick={onRunMockOcr} disabled={!canUpload}>
              {loading
                ? t('import.processing')
                : sourceFile && isCsvFile(sourceFile)
                  ? t('import.importCsv')
                  : t('import.runMock')}
            </button>
          </div>
          {sourcePreview ? (
            <div className="importPreviewWrap">
              <img src={sourcePreview} alt={t('import.sourceAlt')} className="importPreview" />
            </div>
          ) : sourceFile && isCsvFile(sourceFile) ? (
            <p className="muted">{t('import.csvSelected', { name: sourceFile.name })}</p>
          ) : null}
        </section>

        <section className="card">
          <h2>{t('import.step2')}</h2>
          <div className="importSummary">
            <span>{t('import.total', { count: rows.length })}</span>
            {importInfo ? <span>{t('import.status', { status: importInfo.status })}</span> : null}
          </div>
          <p className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
            {t('import.step2MatrixHint')}
          </p>
          {rows.length === 0 ? (
            <p className="muted">{t('import.noRows')}</p>
          ) : (
            <div className="importTableWrap">
              <table className="importTable">
                <thead>
                  <tr>
                    <th>{t('import.col.roll')}</th>
                    <th>{t('import.col.name')}</th>
                    <th>{t('import.col.notes')}</th>
                    <th>{t('import.col.edited')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.localId}>
                      <td>{row.roll_number != null ? row.roll_number : ''}</td>
                      <td>
                        <input
                          value={row.name}
                          onChange={(e) => updateRow(row.localId, { name: e.target.value })}
                          disabled={disableEdit}
                        />
                      </td>
                      <td className="importNotesCell">{row.notes?.trim() ? row.notes : ''}</td>
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
