# Attendance Photo Import Plan

## Goal
Add a feature that lets organizers take/upload a photo of manual attendance notes (for example: `alice: attended`, `alex: not attended`), run OCR to extract records, review and correct results on a dedicated page, and then save finalized data to the system.

## Current Project Context
- Frontend: React + TypeScript (`frontend/`)
- Backend: FastAPI + SQLite (`backend/`)
- Existing attendance data model: `checkins` with `nickname`, `created_at`, `is_real`

This plan is designed to fit the existing stack and keep risk low by shipping an MVP first.

## Product Flow (MVP)
1. User opens a new page: **Attendance Import**.
2. User uploads/takes a photo.
3. Frontend sends image to backend OCR endpoint.
4. Backend returns parsed rows like:
   - name: `alice`, status: `attended`
   - name: `alex`, status: `not_attended`
5. Frontend shows an **editable review table** before saving.
6. User fixes OCR mistakes (name/status/delete/add row).
7. User confirms and saves.
8. Backend stores final confirmed rows and returns import summary.

## Recommended Data Design

### 1) New table for import sessions
Create an `attendance_imports` table to track each upload/review/save action:
- `id`
- `created_at`
- `source_image_path` (or object storage URL)
- `ocr_raw_text`
- `parse_confidence` (optional)
- `status` (`draft`, `confirmed`, `failed`)
- `created_by` (optional for future auth)

### 2) New table for imported rows
Create `attendance_import_items`:
- `id`
- `import_id` (FK to `attendance_imports`)
- `name`
- `attendance_status` (`attended`, `not_attended`, `unknown`)
- `is_edited` (bool, if user changed OCR result)

### 3) How to connect to existing checkins
For MVP, **do not overwrite existing `checkins` records automatically**.
Instead:
- keep imported data in dedicated tables first
- add an optional follow-up action: convert `attended` rows into `checkins`

This avoids breaking current check-in logic and time-window behavior.

## API Design (FastAPI)

### `POST /api/attendance-imports/ocr`
Purpose: upload image and return parsed draft rows.

Request:
- `multipart/form-data`
- file field: `image`

Response (example):
- `import_id`
- `raw_text`
- `items`: array of `{ temp_id, name, attendance_status, confidence }`

### `PUT /api/attendance-imports/{import_id}/items`
Purpose: save user-edited rows in draft.

Request:
- list of editable items from review page

Response:
- updated items

### `POST /api/attendance-imports/{import_id}/confirm`
Purpose: finalize and persist reviewed data.

Response:
- counts: `total`, `attended`, `not_attended`, `unknown`
- final import status

### `GET /api/attendance-imports/{import_id}`
Purpose: reload draft/confirmed import.

## OCR + Parsing Strategy

### OCR engine choices
- **Fast local MVP:** `pytesseract` + Tesseract installed on host/container.
- **Higher accuracy (later):** cloud OCR service (Google Vision / Azure / AWS Textract).

### Parsing rules
Implement a robust parser that handles:
- separators: `:`, `-`, whitespace
- status synonyms:
  - attended: `attended`, `present`, `yes`, `y`, `1`
  - not attended: `not attended`, `absent`, `no`, `n`, `0`
- line cleanup:
  - trim spaces
  - ignore empty/noise lines
  - normalize case

If status cannot be confidently determined, set `unknown` and force manual review.

## Frontend Page Design

## Route
- Add route: `/attendance/import`

## Components
1. **ImageUploader**
   - file picker + mobile camera capture (`accept="image/*" capture="environment"`)
2. **PreviewPanel**
   - show uploaded image
3. **EditableTable**
   - columns: Name, Status, Confidence, Edited flag, Actions
   - actions: edit, delete, add row
4. **SummaryBar**
   - counts by status + validation errors
5. **ConfirmSection**
   - Save Draft
   - Confirm & Store

## Validation before confirm
- name is not empty
- status is one of allowed enum values
- optional duplicate-name warning

## Security and Reliability
- file size limit (for example 5 MB)
- allowed MIME types (`image/jpeg`, `image/png`, `image/webp`)
- server-side image sanitization/re-encode
- timeout handling for OCR
- clear error states: OCR failed, parse failed, network failed
- keep raw OCR text for troubleshooting

## Implementation Steps (Suggested Order)

### Phase 1: Backend foundation
1. Add DB models + migration for `attendance_imports` and `attendance_import_items`.
2. Add OCR upload endpoint returning parsed draft rows.
3. Add parser module with unit tests for common line formats.

### Phase 2: Frontend review flow
1. Add API client methods in `frontend/src/api.ts`.
2. Add `/attendance/import` page with upload -> OCR -> editable table.
3. Add draft update + confirm actions.

### Phase 3: Polish + integration
1. Add entry point link from `Home` page.
2. Improve UX (loading states, error banners, retry).
3. Add analytics/summary display after confirm.

## Testing Plan

### Backend
- parser unit tests for multiple text formats and typos
- API tests:
  - upload success
  - invalid image type
  - oversized image
  - confirm with invalid rows

### Frontend
- component tests:
  - edit row
  - add/delete row
  - confirm disabled when invalid
- manual E2E:
  - upload photo -> edit -> confirm -> verify DB rows

## Acceptance Criteria (MVP)
- User can upload or capture an attendance photo.
- System extracts candidate rows automatically.
- User can review and correct all rows before saving.
- Confirm action persists corrected rows in backend.
- Import summary is shown after save.

## Future Enhancements
- multilingual OCR (Japanese/English mixed notes)
- handwriting model support
- duplicate matching against existing members
- bulk convert confirmed `attended` rows into `checkins`
- import history page with re-open and audit log
