# Frontend and backend integration guide

This document describes the actual `count-daraa` implementation inspected on 2026-10-05. It covers all 22 HTTP endpoints, their request/response contracts, authorization, current React consumers and the behavior to preserve during frontend redesign.

Developer documentation is in English as required by `AGENTS.md`; product labels and API validation messages remain Arabic. Examples below use synthetic values. This is a source contract review, not a claim that browser acceptance tests were executed for this document.

## Contents

1. [Architecture and local setup](#1-architecture-and-local-setup)
2. [API client and authentication rules](#2-api-client-and-authentication-rules)
3. [Complete endpoint map](#3-complete-endpoint-map)
4. [Shared response contracts](#4-shared-response-contracts)
5. [Authentication endpoints](#5-authentication-endpoints)
6. [Record endpoints](#6-record-endpoints)
7. [Municipality and account endpoints](#7-municipality-and-account-endpoints)
8. [Excel endpoints](#8-excel-endpoints)
9. [History and health endpoints](#9-history-and-health-endpoints)
10. [Frontend routing and data flow](#10-frontend-routing-and-data-flow)
11. [Errors and feedback](#11-errors-and-feedback)
12. [Cache updates after mutations](#12-cache-updates-after-mutations)
13. [Current integration gaps and design boundaries](#13-current-integration-gaps-and-design-boundaries)
14. [Acceptance checklist](#14-acceptance-checklist)

## 1. Architecture and local setup

```text
Browser -> React/Vite -> /api -> NestJS -> Prisma -> PostgreSQL
```

The browser calls relative `/api` URLs. It does not call the backend port directly.

| Environment | Browser origin | API routing |
| --- | --- | --- |
| Development | `http://localhost:5173` | Vite proxies `/api` to `http://127.0.0.1:3000` |
| Production | Your configured HTTPS origin | Nginx proxies `/api/` to the loopback-bound NestJS backend |

Relevant files:

- [Vite configuration](../frontend/vite.config.ts)
- [Frontend API layer](../frontend/src/api/)
- [Backend HTTP configuration](../backend/src/common/http.ts)
- [Backend environment validation](../backend/src/config.ts)
- [Production Nginx configuration](../nginx/count-daraa.conf)

Local commands, from the repository root, with the existing dependencies:

```powershell
# PostgreSQL is already running in the current development environment.
# If it is stopped:
docker compose up -d db

# Terminal 1
npm run dev --prefix backend

# Terminal 2
npm run dev --prefix frontend
```

Open `http://localhost:5173`. The backend `APP_ORIGIN` must match this exact origin. `http://127.0.0.1:5173` is a different origin. Production requires HTTPS. No frontend API-base environment variable is needed.

## 2. API client and authentication rules

### Use the API layer

`frontend/src/api/` is the only place that knows HTTP. It is one RTK Query API — created once in `baseApi.ts` and extended by each area module through `injectEndpoints`, so there is a single cache, reducer and middleware however many modules exist:

| Module | Covers |
| --- | --- |
| [`baseApi.ts`](../frontend/src/api/baseApi.ts) | `createApi`: the shared transport, cache and `tagTypes` |
| [`errors.ts`](../frontend/src/api/errors.ts) | `ApiFailure` plus `errorMessage` / `errorFields` / `errorRows` |
| [`searchParams.ts`](../frontend/src/api/searchParams.ts) | Query-string builder that drops empty filters |
| [`auth.ts`](../frontend/src/api/auth.ts) | `/auth/*` |
| [`records.ts`](../frontend/src/api/records.ts) | `/records/*`, both roles, always municipality-scoped by the backend |
| [`municipalities.ts`](../frontend/src/api/municipalities.ts) | `/admin/municipalities/*`, `/admin/users/*` |
| [`imports.ts`](../frontend/src/api/imports.ts) | `/admin/imports/*` |
| [`audit.ts`](../frontend/src/api/audit.ts) | `/admin/audit` |

Components use the generated hooks and never build a URL, pick an HTTP method or touch `fetch`:

```ts
import { useRecordsQuery, useSummaryQuery } from '../api';

const summary = useSummaryQuery();
const records = useRecordsQuery({
  category: 'MARTYR',
  page: 1,
  search: '',
  deleted: false,
  // Only an administrator's UI sets this, and only when a filter is selected.
  municipalityId: municipalityId || undefined,
});
```

The filters object *is* the cache key, so a cache entry and its request cannot drift apart. The same object goes to `useExportRecordsMutation`, so an export always matches the list on screen.

`baseQuery` in `baseApi.ts` is internal to the layer. Endpoint URLs omit the API prefix — `VITE_API_URL` supplies it — so writing `/api/records` would produce `/api/api/records`.

Request payload shapes (`RecordPayload`, `Credentials`, `MunicipalityPayload`, `AccountPayload`, `ImportRequest`) live beside the endpoint that sends them. Response entities stay in [types.ts](../frontend/src/types.ts).

### The API prefix must be same-origin

`VITE_API_URL` sets the prefix and defaults to `/api`. It must resolve to the origin the application is served from, because the backend is deliberately not a cross-origin API:

- the session cookie is host-only with `SameSite=Strict`, so the browser will not attach it to a request for another origin;
- the backend enables no CORS and rejects unsafe requests whose `Origin` is not its configured `APP_ORIGIN`.

A relative prefix satisfies this everywhere: Vite proxies it in development, Nginx in production. An absolute URL is accepted only when it points at the current origin. `assertSameOrigin()` in [config.ts](../frontend/src/config.ts) runs from the entry point, so a value such as `http://localhost:3000/api` fails immediately and visibly instead of surfacing as an unexplained 403 at login.

### Cookies and CSRF

- Requests use `credentials: 'same-origin'`.
- Authentication is a server-side opaque session, sent in an HttpOnly cookie. The frontend neither reads the token nor stores it in browser storage.
- The default cookie name is `count_daraa_session`, configurable on the backend. It has `Path=/`, `SameSite=Strict` and `Secure` in production.
- Every unsafe method, including login, logout and uploads, requires the exact configured `Origin` and `X-Count-Daraa: 1`.
- The browser supplies `Origin`; `prepareHeaders` in `baseApi.ts` supplies `X-Count-Daraa` on every call.
- JSON bodies use `Content-Type: application/json`.
- For `FormData`, do not manually set `Content-Type`: the browser must generate the multipart boundary. `fetchBaseQuery` already leaves it unset for a `FormData` body.
- No bearer token or CORS-dependent browser integration is implemented.
- API responses use `Cache-Control: no-store`. The RTK Query cache is a separate in-memory store and is dropped on sign-in, sign-out and session loss.

The export runs through a `queryFn` and does not add the CSRF header, because export is a GET request. The backend still authenticates and scopes it.

### Response handling

Current endpoints return JSON for normal successes, including delete/logout/restore. Export returns binary XLSX. POST endpoints use NestJS's default success status **201**; GET/PATCH/DELETE successes use **200**. The frontend accepts all successful 2xx responses. No current endpoint needs 204 handling.

The TypeScript return type of each endpoint function is a compile-time assertion, not runtime response validation. Keep types synchronized with backend contracts.

## 3. Complete endpoint map

All paths below include the actual `/api` prefix. `Authenticated` means either role; record access is always municipality-scoped for `MUNICIPALITY`.

| # | Method | Endpoint | Access | Hook | Consumer |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/api/auth/login` | Public, CSRF/rate limited | `useLoginMutation` | `Login.tsx` |
| 2 | GET | `/api/auth/me` | Authenticated | `useSessionQuery` | `App.tsx` |
| 3 | POST | `/api/auth/logout` | Authenticated | `useLogoutMutation` | `App.tsx` logout confirmation |
| 4 | GET | `/api/records/summary` | Authenticated | `useSummaryQuery` | `Home.tsx` |
| 5 | GET | `/api/records` | Authenticated | `useRecordsQuery` | `Records.tsx` |
| 6 | GET | `/api/records/:id` | Authenticated | `useRecordQuery` | None; the editor uses the list row |
| 7 | POST | `/api/records` | Authenticated | `useCreateRecordMutation` | `RecordForm.tsx` |
| 8 | PATCH | `/api/records/:id` | Authenticated | `useUpdateRecordMutation` | `RecordForm.tsx` |
| 9 | DELETE | `/api/records/:id` | Authenticated | `useDeleteRecordMutation` | `Records.tsx` confirmation |
| 10 | POST | `/api/records/:id/restore` | SUPER_ADMIN | `useRestoreRecordMutation` | `Records.tsx` deleted-record view |
| 11 | GET | `/api/records/export/xlsx` | Authenticated | `useExportRecordsMutation` | `Records.tsx` |
| 12 | GET | `/api/admin/municipalities` | SUPER_ADMIN | `useMunicipalitiesQuery` | `Municipalities.tsx` |
| 13 | GET | `/api/admin/municipalities/options` | SUPER_ADMIN | `useMunicipalityOptionsQuery` | `Records.tsx`, `Imports.tsx` |
| 14 | POST | `/api/admin/municipalities` | SUPER_ADMIN | `useCreateMunicipalityMutation` | Municipality creation dialog |
| 15 | PATCH | `/api/admin/municipalities/:id` | SUPER_ADMIN | `useUpdateMunicipalityMutation` | Edit and enable/disable dialogs |
| 16 | POST | `/api/admin/municipalities/:id/users` | SUPER_ADMIN | `useCreateAccountMutation` | Account creation dialog |
| 17 | PATCH | `/api/admin/users/:id` | SUPER_ADMIN | `useUpdateAccountMutation` | Account status/password actions |
| 18 | POST | `/api/admin/imports/preview` | SUPER_ADMIN | `usePreviewImportMutation` | `Imports.tsx` |
| 19 | POST | `/api/admin/imports/confirm` | SUPER_ADMIN | `useConfirmImportMutation` | `Imports.tsx` confirmation |
| 20 | GET | `/api/admin/imports` | SUPER_ADMIN | `useImportsQuery` | Import history inside `Imports.tsx` |
| 21 | GET | `/api/admin/audit` | SUPER_ADMIN | `useAuditQuery` | `Audit.tsx` |
| 22 | GET | `/api/health` | Public | None, by design | Container/proxy readiness; no product screen |

`useRecordQuery` (6) is the one hook with no consumer: it completes the endpoint map for a future record-detail route. `/api/health` (22) is deliberately left out of the API layer — it is an operational probe, not application data.

## 4. Shared response contracts

### Roles and categories

| API value | Arabic product label |
| --- | --- |
| `SUPER_ADMIN` | مسؤول النظام |
| `MUNICIPALITY` | حساب لجنة البلدية |
| `MARTYR` | شهداء الثورة |
| `WAR_INJURED` | مصابو الحرب |
| `EXTREME_POVERTY` | الأشد فقراً |
| `SINGLE` | عازب/عازبة |
| `MARRIED` | متزوج/متزوجة |
| `WIDOWED` | أرمل/أرملة |
| `DIVORCED` | مطلق/مطلقة |

Only the two roles and three categories above exist. Use enum values in requests and Arabic labels in the interface.

### User/session response

Login and `/auth/me` return the user directly, without a `{ user: ... }` wrapper:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "username": "municipality_demo",
  "role": "MUNICIPALITY",
  "municipalityId": "22222222-2222-4222-8222-222222222222",
  "isActive": true,
  "municipality": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "بلدية تجريبية",
    "areaName": "منطقة تجريبية",
    "isActive": true
  }
}
```

For `SUPER_ADMIN`, both `municipalityId` and `municipality` are null. The response contains no password hash, cookie value or raw session token.

### Record response

List items, single-record reads, create and update return these fields:

```ts
interface RecordResponse {
  id: string; // UUID
  municipalityId: string; // UUID
  category: 'MARTYR' | 'WAR_INJURED' | 'EXTREME_POVERTY';
  personName: string;
  maritalStatus: 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'DIVORCED' | null;
  spouseName: string | null;
  nationalId: string | null;
  familyBookNumber: string | null;
  familyMembersCount: number | null;
  phone: string | null;
  notes: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime, used for edit conflict protection
  deletedAt: string | null;
  municipality: { name: string; areaName: string };
}
```

The frontend `CensusRecord` type declares all of the fields above, including `createdAt`.

### Pagination

Record, municipality, import-history and audit lists share this envelope:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 25
}
```

`total` is the number of matching records, not just the page length. Query defaults: `page=1`, `pageSize=25`. Valid ranges: page 1–100000, pageSize 1–100. The frontend currently displays 25 rows per page.

Calculate page count as `Math.ceil(total / pageSize)` and reset page to 1 when changing search/filter selections. Dates arrive as ISO strings; use the `dateText()` helper for display and `numberText()` for counts and totals. Both format Arabic text with Western digits (`ar-SY-u-nu-latn`) so screen values match the identifiers in the same row and the digits written to the Excel exports. IDs and phone numbers remain strings.

## 5. Authentication endpoints

### 1. POST `/api/auth/login`

JSON body:

```json
{
  "username": "municipality_demo",
  "password": "EXAMPLE_ONLY_NOT_A_REAL_PASSWORD"
}
```

Response: user/session response from section 4 and an HttpOnly `Set-Cookie` header.

- Username is trimmed/lowercased; login accepts up to 80 characters.
- Login password is required and accepts up to 128 characters. Account creation/reset has the separate 6-character minimum; a longer administrator password is recommended.
- Failed credentials or inactive user/municipality return generic Arabic 401.
- Rate limit: 10 requests per IP per 15 minutes; 429 after the limit.
- Extra JSON keys are rejected by strict validation.

Frontend call:

```ts
const [login] = useLoginMutation();
await login({ username, password }).unwrap();
// Start the new session from an empty cache; the session query refetches.
dispatch(resetApiState());
```

Disable the form during the request. The authenticated router then redirects a municipality user to `/` and an administrator to `/admin`.

### 2. GET `/api/auth/me`

No body/query parameters. Returns the current user, or 401 if the session is absent, expired, revoked, or the user/municipality is inactive.

`App.tsx` calls `useSessionQuery` on startup. The endpoint's `queryFn` turns a 401 into `null` data, so "signed out" arrives as data rather than as an application crash; any other status keeps the error/retry screen. Authorization is still checked server-side on every protected request.

A 401 from *any other* endpoint is handled by the `sessionGuard` middleware in [store.ts](../frontend/src/store.ts), which drops the whole cache once. It is conditional on the session cache still holding a user, so repeated 401s cannot cause a reset loop.

### 3. POST `/api/auth/logout`

No body required:

```ts
const [logout] = useLogoutMutation();
await logout().unwrap();
dispatch(resetApiState());
```

Response:

```json
{ "message": "تم تسجيل الخروج" }
```

The backend revokes the server-side session and clears the cookie. `App.tsx` uses a confirmation dialog. Any API 401 triggers the frontend `session-expired` event, which clears cached data and returns to login.

## 6. Record endpoints

### 4. GET `/api/records/summary`

No filter/body. Municipality users receive counts for their authenticated municipality; administrators receive system-wide counts and the municipality count.

```json
{
  "counts": {
    "MARTYR": 12,
    "WAR_INJURED": 8,
    "EXTREME_POVERTY": 20
  },
  "municipalityCount": 4
}
```

`municipalityCount` is omitted for municipality users. Categories with zero records may be absent from `counts`; render `counts[category] ?? 0`. Deleted records are excluded. The administrator municipality count includes active and inactive municipalities.

Consumer: `Home.tsx`, query key `['summary']`. Municipality home must retain the three large category cards and its municipality name.

### 5. GET `/api/records`

Supported query parameters:

| Parameter | Contract |
| --- | --- |
| `category` | Optional category enum; category screens always send it |
| `maritalStatus` | Optional SINGLE, MARRIED, WIDOWED or DIVORCED; filters both list/count and export within the authenticated scope |
| `search` | Optional trimmed string, max 100 characters |
| `page` / `pageSize` | Shared pagination |
| `municipalityId` | Optional UUID, effective as a filter for SUPER_ADMIN only |
| `deleted` | String `"true"` or `"false"`; default `"false"`; `"true"` requires SUPER_ADMIN |

Search covers person name, national ID, family book number and phone. The server normalizes Arabic/Persian digits for search and performs server-side pagination.

```ts
const result = useRecordsQuery({
  category: 'MARTYR',
  search,
  page,
  deleted: false,
  // Only an administrator's UI sets this, and only when a filter is selected.
  municipalityId: municipalityId || undefined,
});
```

Returns `Page<RecordResponse>`, ordered newest first. `deleted=true` means only deleted records, not a mixture of active/deleted records.

Consumer: `Records.tsx`. The filters object is the cache key. Search debounce is 300 ms. Show loading, empty, success and error states explicitly.

### 6. GET `/api/records/:id`

`:id` must be a UUID. Returns one active `RecordResponse`. Deleted records are excluded, including for administrators on this endpoint. A record owned by another municipality returns the same 404 as a nonexistent record.

```ts
const record = useRecordQuery(recordId);
```

The current editor uses the full record supplied by the paginated list and does not make this request. This endpoint is suitable for a future direct detail route or refreshing a record before editing. Do not invent an unauthenticated detail endpoint.

### Shared create/update body

```json
{
  "category": "MARTYR",
  "personName": "اسم تجريبي للاختبار",
  "maritalStatus": "MARRIED",
  "spouseName": "اسم زوجة تجريبي",
  "nationalId": "00123456789",
  "familyBookNumber": "000123",
  "familyMembersCount": 5,
  "phone": "00963000000000",
  "notes": "بيانات تجريبية"
}
```

| Field | Validation/integration behavior |
| --- | --- |
| `category` | Required enum |
| `personName` | Required, whitespace trimmed/collapsed, max 200 |
| `maritalStatus` | Required for MARTYR/WAR_INJURED; SINGLE, MARRIED, WIDOWED or DIVORCED; accepts عازب/عازبة/عازبه/أعزب/اعزب, متزوج/متزوجة/متزوجه, أرمل/أرملة/أرمله (also without hamza), مطلق/مطلقة/مطلقه |
| `spouseName` | Optional/null, max 200; required for MARRIED in those categories |
| `nationalId` | Optional/null string, max 50; preserve leading zeroes |
| `familyBookNumber` | Optional/null string, max 50; preserve leading zeroes |
| `familyMembersCount` | Optional integer 1–10000; blank, omitted or null values become null; frontend sends a number or null |
| `phone` | Optional/null string, max 50; preserve leading zeroes |
| `notes` | Optional/null string, max 2000 |
| `municipalityId` | Optional UUID in the schema; administrator must select a municipality when creating |
| `expectedUpdatedAt` | Optional ISO datetime; frontend supplies it when editing |

For SINGLE, clear/hide the spouse field; the backend forces spouseName to null. For EXTREME_POVERTY, send `maritalStatus: null`; spouseName remains optional. Normalize numeric-like digits without converting identifiers/phones to numbers. Do not aggressively normalize names.

For WIDOWED and DIVORCED, spouseName is optional. Empty family counts are stored as null and rendered as an em dash in lists/previews; exports leave the cell blank. Exported marital labels include both gender forms and are valid import values.

Send only request fields. Do not spread the entire API response into a save body: fields such as `id`, `municipality`, `createdAt` and `deletedAt` are rejected by strict validation.

### 7. POST `/api/records`

Body: shared create body. For an administrator, also include the selected `municipalityId`. A municipality user's form omits it; the backend always derives the effective municipality from the session even if a caller supplies a different valid UUID.

Response: created `RecordResponse`.

- Creating requires an active municipality.
- An existing active record with the same nonempty normalized national ID in the same municipality/category produces 409 `DUPLICATE`.
- There is no duplicate-override flag or endpoint in the current implementation.

Consumer: the reusable `RecordForm.tsx`, with no separate form per category. On success close the editor, show `تم حفظ البيانات بنجاح`, and refresh dependent queries.

### 8. PATCH `/api/records/:id`

Body: **complete validated record form**, not an arbitrary partial patch. `RecordPayload` is the same type used for create; include the existing category and `expectedUpdatedAt: record.updatedAt`.

```ts
const [updateRecord] = useUpdateRecordMutation();

await updateRecord({
  id: record.id,
  expectedUpdatedAt: record.updatedAt,
  body: {
    category: record.category,
    personName,
    maritalStatus,
    spouseName,
    nationalId,
    familyBookNumber,
    familyMembersCount,
    phone,
    notes,
  },
}).unwrap();
```

Response: updated `RecordResponse`. Municipality/category cannot be changed through this endpoint. Cross-municipality access returns 404. Edits require an active municipality. Duplicate national IDs produce 409 `DUPLICATE`. A mismatched version produces 409 `STALE_RECORD`; ask the user to reopen/refresh the record rather than overwrite newer data.

Consumer: `RecordForm.tsx`. Field errors stay inline and entered values remain visible on failure.

### 9. DELETE `/api/records/:id`

No body. Response:

```json
{ "message": "تم حذف السجل" }
```

This sets `deletedAt`; it does not physically remove census data. It excludes the record from normal lists, counts, search, exports and duplicate checks. Cross-municipality access returns 404.

Consumer: the confirmation dialog in `Records.tsx`. Only send the request after explicit confirmation; disable the action while pending.

### 10. POST `/api/records/:id/restore`

SUPER_ADMIN only. No body. Response:

```json
{ "message": "تمت استعادة السجل" }
```

Restore requires a deleted record and active municipality. A conflicting active national ID produces 409 `DUPLICATE`. The current UI lists deleted records through `GET /records?deleted=true` and restores them from that list. Municipality users must not see the deleted view or restore action.

### Isolation rules for every record operation

The backend derives municipality scope from `actor.municipalityId` for municipality users. A valid browser-supplied municipality ID cannot alter this scope through body/query/headers/paths. Invalid input can still fail schema validation. Never use a frontend filter as the security boundary.

The same server scope applies to list, single read, create, update, delete, counts, duplicate checks and export. Administrator-only restore/import/municipality/account endpoints are guarded on the backend and return 403 to authenticated municipality callers.

## 7. Municipality and account endpoints

All endpoints in this section require SUPER_ADMIN. Their UI is [Municipalities.tsx](../frontend/src/pages/Municipalities.tsx).

### Municipality and account response shapes

Municipality fields: `id`, `name`, `areaName`, `isActive`, `createdAt`, `updatedAt`.

Safe account fields: `id`, `username`, `isActive`, `lastLoginAt`. No password or passwordHash is returned.

### 12. GET `/api/admin/municipalities`

Query: pagination and optional `search` (max 100, searches municipality name). Returns `Page<MunicipalityListItem>`; each item contains municipality fields plus:

```json
{
  "users": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "username": "municipality_demo",
      "isActive": true,
      "lastLoginAt": null
    }
  ],
  "_count": { "records": 12 }
}
```

`_count.records` includes only active census records. Accounts are ordered by creation time; municipalities are ordered by name. Frontend query key: `['municipalities', page, debouncedSearch]`.

### 13. GET `/api/admin/municipalities/options`

No pagination/search body. Returns a direct array of up to 5000 municipalities:

```json
[
  {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "بلدية تجريبية",
    "areaName": "منطقة تجريبية",
    "isActive": true
  }
]
```

Includes inactive municipalities and their status. Use these in administrator filters; only active municipalities may be selected for new records/imports. The backend rechecks active state. Consumers share query key `['municipality-options']`. Municipality users never request this endpoint.

### 14. POST `/api/admin/municipalities`

Creates the municipality and initial municipality account in one transaction.

```json
{
  "name": "بلدية تجريبية",
  "areaName": "منطقة تجريبية",
  "username": "municipality_demo",
  "password": "EXAMPLE_ONLY_NOT_A_REAL_PASSWORD"
}
```

Validation: name/areaName required, max 150; username 3–80 Latin letters/digits/`.`/`_`/`-`, trimmed/lowercased; password 6–128 characters. Duplicate municipality names/usernames return 409.

Response: municipality fields plus `users: [safeAccount]`. This mutation response does **not** include the list-only `_count` object; refresh the list instead of treating it as a complete list item. The server fixes the account role to MUNICIPALITY.

### 15. PATCH `/api/admin/municipalities/:id`

Accepted optional fields: `name`, `areaName`, `isActive`. Examples:

```json
{ "name": "اسم بلدية تجريبي", "areaName": "اسم منطقة تجريبي" }
```

```json
{ "isActive": false }
```

Response: municipality fields, without `users` or `_count`. Disabling a municipality revokes its users' active sessions and retains census records. Enabling uses `isActive: true`; users must log in again after revocation. Require confirmation before disabling.

### 16. POST `/api/admin/municipalities/:id/users`

Creates an additional account associated with exactly the municipality in the path.

```json
{
  "username": "municipality_second",
  "password": "EXAMPLE_ONLY_NOT_A_REAL_PASSWORD"
}
```

Same username/password validation as initial creation. Response: `safeAccount`. The server assigns MUNICIPALITY role and path municipality; the frontend must not supply role or municipalityId in the body. A nonexistent municipality returns 404. An account for an inactive municipality cannot authenticate until the municipality is enabled.

### 17. PATCH `/api/admin/users/:id`

Accepted optional fields: `isActive`, `password`. Operates on municipality accounts only.

```json
{ "isActive": false }
```

```json
{ "password": "EXAMPLE_ONLY_NOT_A_REAL_PASSWORD" }
```

Response: `safeAccount`. Password reset and disable revoke current sessions. Enable uses `isActive: true`; a disabled municipality still prevents login. This endpoint does not change username, municipality or role and does not reset SUPER_ADMIN credentials. Require clear confirmation/feedback for account disable and password reset. Never show an existing password.

## 8. Excel endpoints

### 11. GET `/api/records/export/xlsx`

Required query: `category`. Optional filters: `search`, `maritalStatus`, administrator `municipalityId`. Normal record-query pagination parameters are accepted but **do not limit export to the current page**; export includes all matching active records, bounded to 50000. `deleted=true` is rejected.

```ts
const [exportRecords, { isLoading }] = useExportRecordsMutation();

// Pass the same filters object the list is using, so the export always
// matches what is on screen.
await exportRecords(filters).unwrap();
```

Response headers:

```text
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename=count-daraa.xlsx; filename*=UTF-8''...
```

Use the existing binary download helper; do not parse the success body as JSON. It reads the UTF-8 filename, creates a Blob URL, downloads and revokes the URL.

Behavior:

- Municipality export is always the authenticated municipality and selected category, irrespective of a supplied municipality filter.
- Administrator export supports a selected municipality or all municipalities for one category. All-municipality export uses separate worksheets per municipality.
- Worksheets are RTL with canonical Arabic headings, municipality/area/date metadata and generated sequence numbers.
- National ID, family book and phone values retain leading zeroes as text.
- User text that could be interpreted as a formula is centrally escaped.
- Deleted records are excluded; export is audited without copying census rows to audit metadata.
- At most two Excel operations run concurrently in one backend process; overload returns 429. Exceeding the row cap requires narrower filters.

Canonical mappings are centralized in [headers.ts](../backend/src/excel/headers.ts). Do not recreate a second export/import heading map in React.

Consumer: export action in `Records.tsx`. Disable during generation and while viewing deleted records; show a readable failure message and permit retry.

### 18. POST `/api/admin/imports/preview`

SUPER_ADMIN only. Multipart fields must be exactly:

| Part | Value |
| --- | --- |
| `municipalityId` | Selected municipality UUID |
| `category` | Category enum |
| `file` | Original `.xlsx` File |

`usePreviewImportMutation` and `useConfirmImportMutation` take the same `ImportRequest` and build the multipart body inside the API layer:

```ts
const [previewImport] = usePreviewImportMutation();

const preview = await previewImport({
  municipalityId,
  category,
  file,
}).unwrap();
```

No manually assigned multipart `Content-Type`. Limits are enforced server-side: default 10 MiB compressed file and 10000 nonblank rows, with additional bounded ZIP parsing. Only `.xlsx` is supported; formulas, unsupported/ambiguous headers and unsafe archives are rejected. An active municipality is required.

Example response, when a workbook is readable but some rows fail validation:

```json
{
  "totalRows": 10,
  "validRows": 7,
  "invalidRows": 1,
  "duplicateRows": 2,
  "errors": [
    { "row": 9, "message": "عدد أفراد الأسرة يجب أن يكون أكبر من صفر" }
  ],
  "warnings": [
    { "row": 10, "message": "سجل مكرر؛ سيتم تجاوزه دون تعديل أي سجل سابق" }
  ],
  "sample": [
    { "row": 6, "personName": "اسم تجريبي للاختبار", "familyMembersCount": 4 }
  ],
  "canConfirm": false
}
```

`validRows` counts accepted, nonduplicate valid rows; duplicate rows are separate. Errors/warnings are capped at 100 each and the sample at 20. Counters cover the full workbook. Unsupported files/header failures can return 400 rather than a preview object.

A row counts as a duplicate only when **both** the person's triple name and the spouse's triple name match an active record in the selected municipality and category, or an earlier row in the same workbook. A repeated national ID, family book number or phone number does **not** make a row a duplicate. The importer reports duplicates as warnings, so a workbook full of them still previews cleanly with `validRows: 0`. This rule is specific to the importer; the manual record endpoints keep their own national-ID conflict check.

Preview writes no census records, import batches or audit rows. Keep the original File object in component state. Clear the preview whenever municipality, category or file changes.

### 19. POST `/api/admin/imports/confirm`

SUPER_ADMIN only. Re-upload the original File with the same three multipart parts; do not send preview rows or a trusted normalized JSON payload.

```ts
const result = await confirmImport({
  municipalityId,
  category,
  file,
}).unwrap();
```

Response:

```json
{
  "importedRows": 7,
  "duplicateRows": 2,
  "batchId": "33333333-3333-4333-8333-333333333333"
}
```

The backend re-parses the file, revalidates rows/authorization/active municipality, checks duplicates again and transactionally inserts accepted records, history and audit. Hard errors block the import; duplicates are skipped, never used to update an existing record. All inserted records use the municipality selected in the request, never municipality metadata from workbook cells. Counts can change after preview if other records are entered meanwhile; display the confirm response as authoritative.

The current frontend enables confirmation only when `canConfirm` is true, validRows is greater than zero, and no request is pending. It requires a confirmation dialog and reports both imported and skipped duplicate counts. The backend can return a zero-import batch if all rows have become duplicates by confirmation time.

If revalidation discovers hard row errors, the backend returns 400 with `code: 'INVALID_WORKBOOK'`, an Arabic message and an `errors` list. `ApiFailure.rows` carries that list through to the confirmation dialog, which lists the offending rows in place and leaves the preview on screen.

No municipality import button, route, menu item or authorized API exists. A direct call by an authenticated municipality account returns 403.

## 9. History and health endpoints

### 20. GET `/api/admin/imports`

SUPER_ADMIN only. Query: shared `page` and `pageSize`. No municipality/category/search filter is currently implemented here. Returns a paginated list, newest first.

Each item contains:

```ts
interface ImportBatchResponse {
  id: string;
  municipalityId: string;
  category: 'MARTYR' | 'WAR_INJURED' | 'EXTREME_POVERTY';
  originalFileName: string;
  fileChecksum: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  createdById: string;
  createdAt: string;
  municipality: { name: string };
  createdBy: { username: string };
}
```

The frontend `ImportBatch` type declares the subset used in the table. Uploaded workbooks are not permanently retained and this API offers no original-workbook download.

Consumer: history section of `Imports.tsx`, query key `['imports', page]`. Display date, municipality, category, filename, imported/skipped counts and actor, plus empty/loading/error states.

### 21. GET `/api/admin/audit`

SUPER_ADMIN only. Query: pagination and optional `action` string (max 60). Omit action for all events; a supplied action filters by exact value.

```ts
// An empty action is dropped by searchParams(), so no filter is sent.
const audit = useAuditQuery({ page, action });
```

Each item contains `id`, `userId`, `municipalityId`, `action`, nullable `entityType`, nullable `entityId`, nullable JSON `metadata`, `createdAt`, plus nullable `user: { username }` and `municipality: { name }` relations.

Current action labels used in React:

```text
LOGIN, LOGIN_FAILED, LOGOUT
RECORD_CREATE, RECORD_UPDATE, RECORD_DELETE, RECORD_RESTORE
EXPORT, IMPORT
MUNICIPALITY_CREATE, MUNICIPALITY_UPDATE, MUNICIPALITY_DISABLE
USER_CREATE, USER_DISABLE, USER_ENABLE, PASSWORD_RESET
```

Metadata may include changed field names, category, export row count or import counts. Do not reconstruct or display old/new census PII from audit entries. Handle null actor/municipality and unknown future actions gracefully. Municipality re-enable is audited as `MUNICIPALITY_UPDATE`.

Consumer: `Audit.tsx`, query key `['audit', page, action]`. Reset pagination when changing the action filter.

### 22. GET `/api/health`

Public minimal database readiness check, no body. Executes a lightweight database read and returns:

```json
{ "status": "ok" }
```

This is used for operational/container checks, not as a replacement for `/auth/me` or a mandatory request on every product screen. No credentials or census data are exposed.

## 10. Frontend routing and data flow

| Route | User | Component | Data/actions |
| --- | --- | --- | --- |
| `/login` | Unauthenticated | `Login` | Login |
| `/` | Municipality | `Home` | Session municipality and three scoped category counts |
| `/martyrs` | Authenticated | `Records`, category MARTYR | List/search/create/edit/delete/export |
| `/injured` | Authenticated | `Records`, category WAR_INJURED | Same reusable workflow |
| `/poverty` | Authenticated | `Records`, category EXTREME_POVERTY | Same reusable workflow, no marital selector |
| `/admin` | SUPER_ADMIN | `Home` | Global counts and municipality total |
| `/admin/records` | SUPER_ADMIN | `Records` | Category/municipality filters, CRUD/export/deleted view/restore |
| `/admin/municipalities` | SUPER_ADMIN | `Municipalities` | Municipality and account management |
| `/admin/imports` | SUPER_ADMIN | `Imports` | Options, preview, confirmation, history |
| `/admin/audit` | SUPER_ADMIN | `Audit` | Paginated action-filtered audit history |

Administrators can also open the category routes; those routes still use administrator permissions. A logged-in user opening `/login` is redirected to their role home. An administrator opening `/` is redirected to `/admin`. Unknown routes go to the role home; unauthenticated routes go to login.

`Records` keeps its whole query state in the URL — `category` (administrator view only), `municipalityId`, `maritalStatus`, `deleted`, `page` and `search`. The status selector appears for MARTYR/WAR_INJURED; poverty ignores any stale status parameter. Selecting a status resets the page to 1 and also filters Excel export. The search input keeps the typed value in local state for responsiveness and writes the debounced value into `search` with a history replacement, so typing does not add history entries while a reloaded or shared link still reproduces the same result set. The request query string is built from the URL value, never from the unsettled input, and doubles as the RTK Query cache key.

Startup sequence:

```text
Load React
  -> GET /api/auth/me
     -> 401: show login
     -> success: derive role and municipality from server response
        -> municipality: GET summary -> three cards -> chosen category records
        -> administrator: GET summary -> management screens as selected
```

Saving a record:

```text
Open shared form -> local validation -> disable submit -> POST/PATCH
  -> success: close editor -> success message -> refresh list/counts
  -> field error: retain values -> show inline Arabic errors
  -> stale/duplicate conflict: retain values -> explain action needed
  -> 401: clear session/cache -> login
```

## 11. Errors and feedback

Standard backend error envelope:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "يرجى التحقق من البيانات",
  "fields": {
    "spouseName": "اسم الزوجة مطلوب للمتزوج"
  }
}
```

`fields` is optional. Import confirmation can additionally return `errors`; other errors may include NestJS's `error` property. Read `code`/`message`/`fields` rather than assuming every error has the same optional properties.

Every endpoint rejects with the same normalized `ApiFailure`: `status`, `code`, an Arabic `message`, `fields` for per-field messages and `rows` for the row-level `errors` array returned by the Excel import endpoints. `fields` and `rows` are always present — empty when the response carries none — so a consumer never probes for a property.

`ApiFailure` is a plain object rather than an `Error` subclass because RTK Query stores a rejected value in the Redux store, which must stay serializable. Components read it through `errorMessage()`, `errorFields()` and `errorRows()` instead of `instanceof` checks; each accepts `unknown` and falls back safely, so they are also correct for a thrown `Error` or an unexpected value.

The shared `Confirmation` dialog renders `rows` in place, which is how a failed import confirmation reports the rows that blocked it without discarding the preview on screen.

| Status/code | Frontend behavior |
| --- | --- |
| 400 `VALIDATION_ERROR` | Attach messages to corresponding fields, retain entered values |
| 400 `INVALID_WORKBOOK` | Prevent import, correct workbook and repeat preview |
| 401 | Clear session/cache and show login; login itself shows the generic credential error |
| 403 `CSRF` | Explain that the application must be opened from its configured origin |
| Other 403 | Show `ليس لديك صلاحية لتنفيذ هذه العملية` |
| 404 | Show the missing record/municipality/account message without ownership hints |
| 409 `DUPLICATE` | Ask the user to review an existing scoped record; do not silently retry/override |
| 409 `STALE_RECORD` | Refresh/reopen before editing again |
| 409 `CONFLICT` | Explain the duplicate municipality name or username |
| 409 `RETRY` | Explain concurrent change and allow an explicit retry |
| 413 | Explain request/upload size limit |
| 429 `RATE_LIMIT` | Explain login wait time |
| Other 429 | Explain temporary Excel processing capacity and allow later retry |
| 500 | Generic Arabic failure; no stack trace or database error |
| Client status 0 | Network/response-processing failure; offer retry |

Existing field-error handling:

```ts
try {
  await createRecord(payload).unwrap();
} catch (error) {
  setErrors(errorFields(error));
  setMessage(errorMessage(error, 'تعذر حفظ البيانات'));
}
```

Every data screen needs loading, success, empty and error states. Keep field errors associated with labels via `aria-describedby`/`aria-invalid`, retain visible keyboard focus and avoid color-only feedback. Guard submit/delete/import/export against repeated clicks. Do not automatically retry mutations: a network error can occur after a successful server commit, so re-check server state before repeating an uncertain save/import.

## 12. Cache updates after mutations

[baseApi.ts](../frontend/src/api/baseApi.ts) sets `refetchOnMountOrArgChange: 15` seconds, plus refetch on focus and on reconnect; `setupListeners` in [store.ts](../frontend/src/store.ts) activates the last two. RTK Query does not retry by default.

Freshness is declarative: each query declares what it provides, each mutation declares what it invalidates, and no screen maintains a list of cache keys.

| Tag | Provided by | Invalidated by |
| --- | --- | --- |
| `Session` | `session` | — (cleared wholesale instead) |
| `Record` | `records`, `record` | create/update/delete/restore record, confirm import |
| `Summary` | `summary` | create/delete/restore record, confirm import, municipality create/update |
| `Municipality` | `municipalities` | municipality + account mutations, create/delete/restore record, confirm import |
| `MunicipalityOption` | `municipalityOptions` | municipality create/update |
| `Import` | `imports` | confirm import |
| `Audit` | `audit` | — see below |

A tag invalidation refreshes every variant of a list query, not just the visible page, so `Record` covers all categories, municipalities and pages at once.

Record mutations invalidate `Municipality` because `_count.records` in the municipality list changes with them — a gap in the previous manual implementation.

`Session` is not invalidated by a tag. Sign-in, sign-out and session loss each drop the entire cache with `resetApiState()`, which is the correct blast radius: no other user's data may survive a session change.

Audited actions still do not invalidate `Audit`. The audit screen refreshes on mount, on focus and on its 15-second staleness window; adding `Audit` to every mutation would refetch a screen that is usually not mounted. This is a freshness choice, not an authorization gap — keep server authorization unchanged when revising cache behavior.

## 13. Current integration gaps and design boundaries

### What is already connected

Login/session/logout, home counts, record list/search/pagination/save/delete/restore/export, municipality/account management, admin import preview/confirmation/history and audit are implemented against real API calls. There are no public-registration or municipality-import flows.

### Available APIs without a current product request

- `GET /records/:id`: available; the current editor uses the full row from the list. Direct detail routing or fetch-on-open is an optional enhancement.
- `GET /health`: deliberately operational; no municipality dashboard request is needed.

### Improvements to make explicit before claiming complete browser integration

1. Improve the cache freshness cases in section 12 when changing mutation hooks.
2. Add frontend integration tests for admin account actions, multipart preview/confirm and binary download. The current form/home/records/api tests do not prove every browser workflow.
3. Perform authenticated browser acceptance through the actual origin, and separately through production HTTPS. This document records code inspection, not a completed visual/mobile/browser verification.

Resolved since the first revision of this document: confirmation-stage row `errors` are preserved by `ApiFailure.rows` and rendered by the confirmation dialog, and a failed confirmation now keeps the preview on screen instead of clearing it.

### Boundaries for UI redesign

- Keep Arabic RTL, semantic labels, clear loading/errors and large touch targets.
- Keep the municipality home limited to its name and three category cards.
- Reuse one census form with category-specific labels and spouse/marital rules.
- Show a small table subset; full details belong in the record editor/detail view.
- Keep admin-only navigation/API requests gated by the server-reported role.
- Never send another municipality filter from a municipality UI or rely on hidden buttons for security.
- Retain confirmation dialogs for delete, disable and import, and preserve dirty-form warnings.
- Keep identifiers and phone fields as text with readable direction; never convert them to numeric state.
- Use the installed React/Router/Query tools. No dependency changes are required to follow this integration guide.
- Take every colour, radius and brand value from the tokens in `frontend/src/index.css`. The `--brand-logo` token fills the reserved emblem slot in the header and on the sign-in page; it stays `none` until an approved asset exists, and no emblem is drawn in markup.

## 14. Acceptance checklist

This checklist is for execution during frontend work; it is not a list of new checks run while writing this document.

### Authentication

- Valid login redirects to the correct role home.
- Invalid login displays the generic Arabic error and retains username.
- Reload preserves the server session through `/auth/me`.
- Expired/revoked/disabled sessions return to login and clear prior query data.
- Logout revokes the session; browser Back does not restore authorized access.
- A different origin is rejected on unsafe requests.

### Municipality workflow

- Home shows exactly three cards and correctly handles zero counts.
- Each category lists only the authenticated municipality, including during search/pagination/export.
- Add/edit validates spouse/category rules and optional family count (positive when supplied).
- Leading-zero identifiers survive save, reload and export.
- Duplicate and stale-edit failures retain inputs and explain the problem.
- Delete requires confirmation and updates counts/list; data is soft-deleted.
- No municipality account requests admin options/import/history/audit/account endpoints.
- Direct unauthorized admin/import API calls return 403; another municipality's record read/update/delete returns 404.

### Administrator workflow

- Create municipality/account atomically; reject duplicate name/username.
- Edit and enable/disable municipality/account with correct feedback and session revocation.
- Password reset never displays an existing password.
- Category/municipality/search filters and deleted-record restore work together.
- Export generates the selected category and correct municipality scope.
- Import preview writes nothing; hard errors block confirmation.
- Confirmation uploads the original file again; duplicates are skipped/reported.
- Successful imports refresh lists/counts/history; audit displays only appropriate metadata.

### UX and verification

- Exercise loading, empty, error and success states on every screen.
- Check keyboard dialogs/focus, RTL mobile layouts and mixed-direction identifiers.
- Verify repeated clicks do not send duplicate mutations.
- Run existing lint/test/build scripts after implementation changes; use `count_daraa_test` for database integration tests.
- Run authenticated browser tests before describing a redesigned interface as verified end-to-end.

## Source references

- [Frontend types](../frontend/src/types.ts), [API layer](../frontend/src/api/), [routing/session shell](../frontend/src/App.tsx)
- [Store and session guard](../frontend/src/store.ts), [API prefix configuration](../frontend/src/config.ts), [test helpers](../frontend/src/test-utils.tsx)
- [Design tokens and base styles](../frontend/src/index.css), [shell and page layouts](../frontend/src/App.css), [shared UI components](../frontend/src/components/ui.tsx)
- [Record form](../frontend/src/components/RecordForm.tsx), [record page](../frontend/src/pages/Records.tsx)
- [Municipality/account UI](../frontend/src/pages/Municipalities.tsx), [import UI](../frontend/src/pages/Imports.tsx), [audit UI](../frontend/src/pages/Audit.tsx)
- [Backend validation](../backend/src/common/validation.ts), [HTTP errors/CSRF](../backend/src/common/http.ts)
- [Authentication](../backend/src/auth/auth.controller.ts), [record service](../backend/src/records/records.service.ts)
- [Municipality service](../backend/src/municipalities/municipalities.service.ts), [Excel service](../backend/src/excel/excel.service.ts), [history service](../backend/src/history/history.service.ts)
