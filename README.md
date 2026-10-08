# count-daraa

An Arabic-first government census application for Daraa Governorate. It collects **شهداء الثورة**, **مصابو الحرب** and **الأشد فقراً**. Only `SUPER_ADMIN` can log in. The historical `MUNICIPALITY` role and user rows are retained for record ownership and audit history; their login and sessions are rejected.

## Architecture and folders

React + TypeScript + Vite → same-origin `/api` → NestJS + TypeScript → PostgreSQL via Prisma. The frontend talks to the API through RTK Query (`@reduxjs/toolkit`), whose cache is the only Redux state. Production uses host Nginx for the static SPA and HTTPS entry point. The backend is a conventional modular monolith; no CORS-dependent deployment, public registration, analytics, external fonts, queues or real-time infrastructure.

```text
frontend/          Arabic RTL application, shared census form, admin screens
frontend/src/api/  the only place that knows HTTP: one RTK Query baseApi plus
                   one module per area (auth, records, municipalities,
                   imports, audit)
frontend/src/store.ts  the API cache and the 401 session guard
backend/src/       auth, municipalities, records, excel, history, common, prisma
backend/prisma/    schema and append-only migration history
backend/test/      real PostgreSQL HTTP tests and test-database safety guards
backend/scripts/   isolated test database setup and synthetic HTTP smoke fixtures
nginx/             production HTTPS configuration example
scripts/           Docker preparation and backup helpers
docker-compose.yml PostgreSQL and optional production backend/migration services
```

The earlier folders were scaffold-only Vite/Nest projects. No Next.js application or dependency is part of V1. The original Git metadata was preserved at the project root.

## Prerequisites and dependency policy

- Node.js **24 LTS**, npm **11**, PostgreSQL **18** (Docker Compose example), Docker Desktop/Engine with Compose.
- A modern browser. Local development is supported on Windows/PowerShell and Linux.
- Production: Linux host, Nginx 1.26 or newer, a real domain, valid TLS certificates and protected backups.

**Dependencies are frozen.** Preserve both package lockfiles, framework/Prisma versions and the existing backend overrides. Do not run `npm update`, `npm audit fix`, remove lockfiles, or add/remove/replace packages without explicit approval. All commands below run existing tools. Installation instructions are for an authorized fresh environment only:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
```

The application needs no globally installed NestJS or Prisma CLI. Run the two applications with the prefix commands below; no root package or extra process-manager dependency is required.

## Configuration

Copy examples only when the corresponding real `.env` does not already exist. Never overwrite a working configuration or commit real credentials.

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Root `.env`:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Required database password. Use a random hex string so it is URL-safe. |
| `APP_ORIGIN` | Exact public HTTPS origin for the production backend. No path/query/fragment. |
| `SESSION_TTL_HOURS` | Optional; default 12, range 1–168. |
| `MAX_IMPORT_FILE_MB` | Optional; default 10, range 1–10. |
| `MAX_IMPORT_ROWS` | Optional; default 10000, range 1–10000. |
| `COUNT_DARAA_IMAGE_TAG` | Optional image tag for backend/tools; default `local`. Use a release tag for production. |

Backend `backend/.env`:

| Variable | Required/default |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL URL; local database name `count_daraa`. Match the root database password. URL-encode special characters. |
| `APP_ORIGIN` | Required; local `http://localhost:5173`, production actual HTTPS origin. The address used in the browser must match exactly. |
| `NODE_ENV` | `development` by default; production must be `production`. |
| `PORT` | Default 3000. Vite proxies to port 3000. |
| `SESSION_COOKIE_NAME` | Default `count_daraa_session`. |
| `SESSION_TTL_HOURS` | Default 12. |
| `MAX_IMPORT_FILE_MB` | Default 10. |
| `MAX_IMPORT_ROWS` | Default 10000. |
| `BOOTSTRAP_ADMIN_USERNAME` | Only needed for first administrator bootstrap. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Only needed for bootstrap; accepts 6–128 characters, use at least 12 for the administrator, no placeholder/default password. |
| `TEST_DATABASE_URL` | Optional explicit connection to **count_daraa_test**; otherwise test setup derives that database name from `DATABASE_URL`. |

No token signing secret is needed: sessions use cryptographically random 256-bit opaque tokens and store only SHA-256 hashes. Startup validates configuration and refuses a non-HTTPS production origin. Set `APP_ORIGIN` to the address you actually open; `localhost` and `127.0.0.1` are different origins.

`frontend/.env` holds no secret. It has one optional variable:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | The API prefix. Must be same-origin. |

**It must resolve to the origin the application is served from.** The session cookie is host-only with `SameSite=Strict`, and the backend enables no CORS, so an absolute URL on another host or port — for example `http://localhost:3000/api` while the app runs on `:5173` — cannot authenticate: the browser neither sends the cookie nor allows the cross-origin request. Keep the relative prefix and let the proxy forward it (Vite in development, Nginx in production).

`assertSameOrigin()` in `frontend/src/config.ts` checks this at startup, so a wrong value fails immediately with an explanation instead of appearing as an unexplained 403 at login.

## Local PostgreSQL, migration and bootstrap

From the project root:

```powershell
docker compose up -d db
docker compose ps
```

PostgreSQL uses a persistent named volume and a loopback-only port. **Never use `docker compose down -v` on a database containing real records.**

From `backend`:

```powershell
cd backend
npm run db:generate
npm run db:validate
npm run db:migrate
npm run bootstrap
```

Before bootstrap, set your chosen `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` in the protected backend environment file or process environment. The username is 3–80 characters of `a-z0-9_.-`; password validation accepts 6–128 characters, and an administrator password of at least 12 characters is recommended. Bootstrap hashes the password with Argon2id and never prints it. It is idempotent: an existing super administrator is left untouched and its password is not reset. A municipality account cannot be promoted through bootstrap. Remove bootstrap password configuration after first use.

If bootstrap fails it prints the rule that was broken — for example `كلمة المرور يجب أن تكون 6 محرفاً على الأقل` — so a rejected credential is not mistaken for a database problem. It reports the rule, never the value.

Migration history includes:

- `20261004171428_init`: original applied schema, preserved without edits.
- `20261004173353_integrity_constraints`: municipality-account index and PostgreSQL checks for role/municipality mapping, positive family count, required person name and marital consistency.
- `20261005120000_optional_family_count`: allows unknown family size as NULL; supplied counts must still be integers from 1 to 10000.
- `20261005121000_add_marital_statuses`: adds WIDOWED and DIVORCED with optional spouse information, retaining existing marital constraints.
- `20261008120000_persist_areas`: backfills a persistent area registry, adds the municipality-area foreign key and index.
- `20261008121000_retire_municipality_accounts`: disables historical municipality users, revokes sessions and audits the change without removing ownership/history. Back up before applying these migrations; deploy the matching backend/frontend together.

Prisma does not model these CHECK constraints in its schema DSL; they are maintained in SQL migration history. There is no global unique national-ID constraint. For future schema changes use the installed CLI from `backend`:

```powershell
npx --no-install prisma migrate dev --name meaningful_change
```

Review the generated SQL. Never reset a real database, edit applied migrations or use `prisma db push`.

## Development

Two PowerShell terminals:

```powershell
# Terminal 1, project root
npm run dev --prefix backend

# Terminal 2, project root
npm run dev --prefix frontend
```

Open **http://localhost:5173**. Vite listens on loopback and proxies `/api` to NestJS at port 3000 while preserving the origin. NestJS development also binds to loopback. The default deployment does not enable CORS.

Administrator workflow: log in → summary/category cards → select a municipality → add/edit records or export Excel. Search, marital-status filtering and pagination run on the server; Excel export uses the selected status too. Single status clears the spouse; married status requires a spouse. Poverty has no marital selector and an optional spouse. Historical status spellings ending in ه (عازبه، متزوجه، أرمله، مطلقه) are accepted in record input and Excel import; this normalization never changes people's names.

Family member count is optional: blank, omitted or null values are stored as NULL and exported as an empty cell. A supplied count must be an integer from 1 to 10000. API saves and Excel imports accept `عازب`/`عازبة` as SINGLE, `متزوج`/`متزوجة` as MARRIED, `أرمل`/`أرملة` (also without hamza) as WIDOWED and `مطلق`/`مطلقة` as DIVORCED. Widow/divorced spouse information is optional; married still requires it and single clears it. Export labels show both gender forms and can be imported again.

Municipality creation requires only `name` and `areaName`. Account creation/activation/password endpoints have been removed. Enter a saved area from the sorted suggestions or type a new area; the last successfully saved area remains selected for the next municipality on the page. Areas are persisted independently in the `Area` table, with unique names and a foreign key from `Municipality.areaName`, ready for future grouping/statistics. Names are trimmed and repeated whitespace is collapsed. Editing a municipality's area keeps the previous area available in the registry. Search supports municipality name and area name.

## Navigation and unsent drafts

Navigation comes from one list per role (`frontend/src/components/navItems.tsx`) rendered twice: a sidebar from 721px up, and a fixed bottom bar below that, so the two can never disagree. A municipality sees its home and its three categories; an administrator sees the five management sections.

A **new** census record keeps an unsent draft, so reloading the page does not throw away typed data. The storage is deliberately constrained, because drafts contain names, national IDs and phone numbers:

| Property | Choice |
| --- | --- |
| Store | `sessionStorage` — survives a reload, gone when the tab closes |
| Key | Prefixed and scoped to the authenticated user id and the category |
| Lifetime | 12 hours, then the entry expires and is removed on read |
| Cleared on | Successful save, explicit discard, sign-out, and any 401 |
| Never stored | Anything from the sign-in form, and edits of existing records |

Edits are excluded on purpose: an edit carries an `expectedUpdatedAt` guard that would go stale while the draft sat in storage, so restoring one could push an old version over somebody else's newer save.

`localStorage` is not used anywhere in the application. `sessionStorage` meets the "survive a reload" requirement without leaving census data on a shared committee computer after the tab closes. To change that trade-off, swap the `store()` accessor in `frontend/src/drafts.ts`; the keying, expiry and clearing all still apply.

## Visual identity and branding

The interface is Arabic-first and right-to-left, with one page title and one primary action per screen.

Every colour, radius and layout value is a CSS custom property declared on `:root` at the top of `frontend/src/index.css`. The palette follows the Syrian national colours — a formal green as the primary, white surfaces, near-black text and a restrained red used only as the header rule and for destructive actions. `frontend/src/App.css` holds the shell and page layouts and reads the same tokens. To rebrand, change the token values; no component needs editing.

Every text/background pair in the palette meets WCAG AA (4.5:1 or better for normal text), including white on the green header, the muted secondary text and the active navigation state.

Numbers and dates render as Arabic text with Western digits (`numberText()` and `dateText()` in `frontend/src/types.ts`), so on-screen counts match the identifiers beside them and the digits written to the Excel exports.

`build.cssTarget` in `frontend/vite.config.ts` is pinned so media queries ship as `min-width` / `max-width` rather than the modern range syntax the default target rewrites them to; a browser that does not understand range syntax drops the whole block, which would cost the sidebar and bottom bar silently.

No official emblem, seal or flag is drawn anywhere in the markup. A square slot is reserved for one in the header and on the sign-in page, and stays an empty outline until an approved asset exists:

```css
/* frontend/src/index.css */
:root {
  --brand-logo: url("/logo.svg"); /* file placed in frontend/public/ */
}
```

The layout is polished without a logo, so the token can stay `none` indefinitely.

## Validation and testing

From the project root:

```powershell
npm run lint --prefix backend
npm run lint --prefix frontend
npm run test --prefix backend
npm run test --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
npm audit --prefix backend
npm audit --omit=dev --prefix backend
npm audit --prefix frontend
npm audit --omit=dev --prefix frontend
```

Backend unit tests cover record rules, Arabic digits, headers, unsupported files, limits and formula handling. Frontend tests cover the three-card municipality home, marital behavior, optional poverty spouse, leading zeroes, dirty-form confirmation and pending save protection.

**Real integration tests must use `count_daraa_test`, never `count_daraa`.** Prepare the separate database using the installed `pg` driver and installed Prisma CLI:

```powershell
cd backend
node scripts/prepare-test-db.cjs
npm run test:e2e
npx --no-install prisma validate
```

The setup creates `count_daraa_test` if absent and applies existing migrations with `migrate deploy`. It requires database-creation permission for initial setup; otherwise an operator can create the test database first. Guards verify both configured database name and PostgreSQL's actual `current_database()` before cleanup. Tests use synthetic records and delete only their own fixture IDs. They test real HTTP guards, authentication, CSRF, disabled/expired/revoked sessions, municipality injection through query/body/headers/paths, admin permissions, Excel workflows, concurrent duplicate creates, optimistic edits, restore conflicts, privacy-conscious audit logging and transaction rollback after a deliberately injected audit failure. No development database reset/truncate is performed.

Windows sandbox restrictions may produce `spawn EPERM` for Vite/Prisma or local sockets. Run the same commands in a normal terminal; do not change dependency versions to address that environment restriction.

## Authentication and security

- Argon2id password hashes; no public signup; no tokens in local/session storage.
- HttpOnly host-only cookie, Path=/, SameSite=Strict; Secure in production; fixed expiry and server-side logout/revocation.
- Every protected request reloads user and municipality active state. Sessions cannot keep granting access after disable.
- Every unsafe request, including login/logout/upload, requires the exact configured `Origin` and `X-Count-Daraa: 1`. No broad CORS. SameSite is an additional protection.
- Login is limited to 10 attempts per IP per 15 minutes. Production trusts exactly the one Nginx hop; Nginx replaces incoming forwarding headers. Do not expose the backend directly or insert another proxy without reviewing this configuration.
- Municipality scope comes from the server-side session. Browser municipality values are ignored for normal municipality operations; another municipality's record is indistinguishable from a missing record (404).
- Backend validation is authoritative. Full record saves validate the shared form; category and municipality are immutable on update. The frontend sends `expectedUpdatedAt` to prevent stale saves.
- Soft delete only. Deleted rows are excluded from normal lists/counts/search/export and duplicate checks. Restore rejects conflicts.
- Database transactions include corresponding audit writes. Audit metadata stores field names/counts/category, never whole records, passwords, cookies or session tokens.
- API responses use `Cache-Control: no-store`; JSON is limited to 64 KiB; uploads have explicit limits; errors do not expose stack traces.
- Nginx supplies CSP, frame protections, HSTS after TLS, referrer and permissions policies. No external scripts/fonts/trackers.
- Access logging is disabled in both Nginx layers because API URLs and SPA deep links can contain personal search terms. Keep error-log access restricted and review logging when changing deployment configuration.
- Keep the host, Node/PostgreSQL, TLS certificates and backups maintained. An audit result alone is not proof of application security.

## Excel behavior

Canonical mappings live only in `backend/src/excel/headers.ts`. The importer accepts explicit safe historical aliases, space/NBSP/Unicode variations and Arabic digits. It searches the first 30 rows for headings. Person spelling is preserved apart from safe whitespace cleanup.

Import is super-admin-only:

1. Select an active municipality and category.
2. Upload one `.xlsx` worksheet and request preview. Preview writes neither census rows nor history/audit rows.
3. Review counts, row errors/warnings and up to 20 sample valid names. Messages are capped at 100 per list.
4. Confirm explicitly. The frontend uploads the same original File again; the backend parses, validates and checks database duplicates again.
5. Hard row errors block the entire import. Duplicate warnings are skipped; existing records are never silently updated.
   The confirmation button explains when errors block import or all rows are duplicates. A blank family count and the supported feminine marital labels do not count as errors.
6. Insert accepted rows and import history/audit in one transaction. Store checksum/filename/counts, not the workbook.

Limits: default 10 MiB compressed, 10000 nonblank rows, at most 30 columns, one sheet, 2000 ZIP entries, 20 MiB per entry and 50 MiB expanded total. Macros, external relationships/embedded objects, DTD/entities, unsupported archives and formula/cached-formula cells are rejected. Unknown/ambiguous headers or populated columns without a mapped header are errors. Numeric identifiers with a simple zero format retain the format; unformatted numeric identifiers produce warnings because lost source-file zeros cannot be reconstructed.

**Import duplicate rule.** A row is a duplicate only when **both** the person's triple name (`الاسم الثلاثي للزوج` / `للشهيد` / `للمصاب`) **and** the spouse's triple name (`الاسم الثلاثي للزوجة`) match — either an active record in the selected municipality and category, or an earlier row in the same workbook. Every other row is treated as a distinct household and imported.

Consequences worth knowing:

- Two rows that repeat a national ID, family book number or phone number are **both imported** if their name pair differs. The importer no longer dedupes on identifiers.
- Same husband with a different wife, or same wife with a different husband, is a new household.
- Two rows where both names are blank-equal (for example an unmarried person recorded twice with the same name and no spouse) are duplicates.
- Deleted records never match; only active records count.

Both names are stored trimmed with runs of whitespace collapsed, so the comparison is exact and reliable. Nothing else about a name is normalized — spelling is preserved as entered. The lookup queries only the names the uploaded workbook contains, in batches, so it scales with the upload rather than with the municipality's history.

This rule governs the Excel importer only. Manual record creation keeps its own separate national-ID conflict check and still returns 409 `DUPLICATE`. PostgreSQL transaction advisory locks serialize imports and manual writes in the same municipality/category.

Export is available to both roles and always scope-enforced. It produces real `.xlsx`, RTL/frozen headings, canonical Arabic columns, municipality/area/date metadata, generated sequence numbers and text-formatted identifiers/phones. Formula-like text is apostrophe-escaped centrally. Admin all-municipality export creates one sheet per municipality. Export uses a consistent database snapshot, queries in chunks and caps results at 50000 records; narrow municipality/search filters for larger sets. At most two Excel operations execute at once per backend process to bound memory; additional requests receive a clear retry message.

## API overview

See [the complete frontend/API integration guide](docs/FRONTEND_API_INTEGRATION.md) for all 21 endpoints, request/response contracts, current React consumers, cache updates and integration checks to preserve during frontend redesign.

All paths have the `/api` prefix:

| Method/path | Access |
| --- | --- |
| POST `/auth/login`, POST `/auth/logout`, GET `/auth/me` | Login public; logout/me authenticated |
| GET `/health` | Public minimal database readiness |
| GET `/records`, GET `/records/summary`, GET `/records/:id` | Authenticated, scoped |
| POST `/records`, PATCH `/records/:id`, DELETE `/records/:id` | Authenticated, scoped |
| POST `/records/:id/restore` | Super admin |
| GET `/records/export/xlsx` | Authenticated, scoped; category required |
| GET/POST `/admin/municipalities`, PATCH `/admin/municipalities/:id` | Super admin |
| GET `/admin/municipalities/options` | Super admin, bounded selection list |
| GET `/admin/areas` | Super admin, persisted sorted area names |
| POST `/admin/imports/preview`, POST `/admin/imports/confirm` | Super admin, multipart original file |
| GET `/admin/imports`, GET `/admin/audit` | Super admin, paginated |

Record query: `category`, `maritalStatus` (SINGLE/MARRIED/WIDOWED/DIVORCED), `search` (max 100 characters), `page`, `pageSize` (default 25, max 100). Admin may use `municipalityId` and `deleted=true`. Municipality scope cannot be changed through these values. PATCH accepts a complete validated record form with optional `expectedUpdatedAt`; it does not change municipality/category. Errors return `{ statusCode, code, message, fields? }`; conflict codes include `DUPLICATE` and `STALE_RECORD`. API documentation is kept here; Swagger was not added because dependencies are frozen.

## Production build and deployment

See [the Docker deployment guide](docs/DOCKER_DEPLOYMENT.md) for the Windows preparation command, separate image build/migration/start steps and release checks.

Build locally with the installed frozen dependencies:

```powershell
npm run build --prefix frontend
npm run build --prefix backend
```

Deployment topology:

- PostgreSQL and NestJS in Docker, persistent database volume.
- The `web` Nginx container serves the built frontend and proxies `/api/` to the private backend. Host Nginx terminates HTTPS and proxies to **127.0.0.1:8080** (or configured WEB_PORT).
- Neither PostgreSQL nor backend port is publicly bound. Only Nginx HTTPS is public.
- Backend container runs as non-root, uses a read-only filesystem and dropped capabilities.
- No migration or bootstrap runs automatically when the application starts.
- Health checks and bounded connection retries handle database readiness.

After explicitly authorizing installation of the frozen lockfile contents **inside images**, build all three images using the example environment (no real secrets are required for the build):

```powershell
docker compose --env-file .env.example --profile tools build backend web migrations
```

Set the root production environment with the existing database password and the actual HTTPS origin. Do not replace the password on an initialized database merely by changing `.env`. Then deploy the already-built images:

```sh
docker compose up -d db
docker compose --profile tools run --rm --pull never migrations
docker compose up -d --no-build --pull never backend web
```

The image build installs exactly the committed lockfile contents with `npm ci`; it must be explicitly authorized when the dependency environment is frozen. The tooling build target contains Prisma CLI; the runtime omits dev dependencies and copies the generated client from the build stage.

**Production migration command is `npx --no-install prisma migrate deploy`**, or `npm run db:migrate`, or the Compose migrations service above. Never use `migrate dev`, reset, or `db push` in production. Before each schema rollout take a backup and review migrations; for rollback redeploy the prior application image only when schema-compatible. Do not assume a destructive down migration exists.

For first admin in the runtime container, provide bootstrap variables transiently through the shell environment without printing their values:

```sh
docker compose exec \
  -e BOOTSTRAP_ADMIN_USERNAME -e BOOTSTRAP_ADMIN_PASSWORD \
  backend node dist/bootstrap.js
```

Frontend assets are shipped inside the `web` image; no host copy is required. Adapt `nginx/count-daraa.conf` with your domain, certificate paths and WEB_PORT. This file belongs inside Nginx's `http` configuration (for example `sites-enabled`). Test with `nginx -t`, then reload Nginx. Issue/configure valid certificates before enabling HTTPS; the example contains placeholders, not an unknown production domain. The example upload limit is 11 MiB to accommodate a 10 MiB multipart file and API timeout is 90 seconds. Keep any future proxy chain/body/timeouts aligned with backend configuration.

## Backup, restore and recovery

Backups contain personal data. Restrict filesystem permissions, encrypt off-host copies, control who may restore them and define retention. Credentials are read through the container/environment, never embedded in scripts.

PowerShell, from project root:

```powershell
.\scripts\backup.ps1
```

The helper writes a custom-format `pg_dump` inside the container, then uses `docker compose cp` to preserve binary data. It does not pipe binary dump bytes through Windows PowerShell text redirection. Backups are written to ignored `backups/`.

Linux:

```sh
sh scripts/backup.sh /srv/protected-backups/count-daraa
```

Example daily cron (the operator creates/protects the destination first):

```cron
15 2 * * * cd /srv/count-daraa && /bin/sh scripts/backup.sh /srv/protected-backups/count-daraa >> /var/log/count-daraa-backup.log 2>&1
```

Prefer testing restore into a **new recovery database**, without touching the current database. Copy a selected trusted dump into the container, then:

```sh
docker compose cp /protected/path/selected.dump db:/tmp/selected.dump
docker compose exec -T db createdb -U count_daraa count_daraa_recovery
docker compose exec -T db pg_restore -U count_daraa -d count_daraa_recovery --no-owner --no-acl --exit-on-error /tmp/selected.dump
docker compose exec -T db rm -f /tmp/selected.dump
```

For a trusted plain SQL dump use `psql -U count_daraa -d count_daraa_recovery -v ON_ERROR_STOP=1 -f /tmp/selected.sql` instead. Restore does not require application migrations when the dump includes the migrated schema and migration history. Validate the recovery data and migration status before any controlled cutover. Replacing a live database or running `pg_restore --clean` requires an explicitly authorized maintenance operation, a fresh backup and a tested rollback plan; no automatic script does it.

## Operational limits and verification

No public production domain/TLS configuration is supplied. Browser visual/device review requires an available connected browser; automated DOM and real HTTP tests do not replace that review. The source includes synthetic fixture tooling for a guarded test-database smoke run; never seed real census data as a demo.

Review `git status` before commits. Exclude `.env`, credentials, `node_modules`, `dist`, dumps, temporary fixture files and workbooks. Existing intentional dependency overrides stay in place.
