# AGENTS.md — Count Daraa

## Project Mission

`count-daraa` is a small, security-sensitive Arabic government data-entry system for administrative committees in Daraa Governorate.

The primary goals are:

1. Extremely simple usability.
2. Excellent Arabic and RTL support.
3. Strong municipality data isolation.
4. High data integrity.
5. Secure handling of personal and family information.
6. Maintainable, boring, high-quality code.
7. Minimal operational complexity.

Do not over-engineer this system.

---

# Technology Decisions

Use this architecture:

- Frontend: React + TypeScript + Vite
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Reverse proxy / production entry point: Nginx
- Package manager: npm
- Excel handling: a maintained `.xlsx` library such as ExcelJS

Do NOT use:

- Next.js
- Microservices
- Redis unless a future requirement clearly needs it
- WebSockets
- SSE
- Kafka
- RabbitMQ
- CQRS
- Event sourcing
- GraphQL
- unnecessary abstraction layers

Keep the application as a conventional modular monolith.

---

# Repository Structure

Prefer:

```text
count-daraa/
├── frontend/
├── backend/
├── nginx/
├── docker-compose.yml
├── AGENTS.md
├── README.md
└── .gitignore
```

Frontend and backend must remain clearly separated.

The public user must still access the system through one origin.

Production routing:

```text
/
    -> React static application

/api/*
    -> NestJS backend
```

Do not expose the NestJS port publicly in production.

---

# Core Roles

The system has only two roles:

```text
SUPER_ADMIN
MUNICIPALITY
```

Do not introduce additional roles unless explicitly requested.

### SUPER_ADMIN

Can:

- create municipalities
- edit municipalities
- disable municipalities
- create municipality accounts
- reset municipality passwords
- see all municipalities
- see all census records
- add/edit records
- export data
- import `.xlsx` files
- review import previews
- confirm imports
- inspect audit history

### MUNICIPALITY

Can:

- log in
- see only its own municipality
- see only its own records
- create records
- edit its own records
- soft-delete its own records
- search its own records
- export its own records to Excel

MUNICIPALITY users MUST NEVER be able to import Excel files.

This restriction must be enforced in the backend, not only hidden in the UI.

---

# Municipality Isolation

Municipality isolation is a non-negotiable security rule.

For a MUNICIPALITY user, never trust a municipality ID sent by the browser.

The backend must derive the municipality from the authenticated user:

```text
currentUser.municipalityId
```

Never implement municipality access like this:

```text
request.municipalityId
```

for normal municipality operations.

Every read, update, delete, export, count, duplicate check, and lookup must enforce municipality ownership at the service/database level.

A user from Municipality A must not be able to discover whether a record from Municipality B exists.

Prefer returning 404 rather than leaking cross-municipality resource existence.

---

# Census Categories

There are exactly three census categories:

```text
MARTYR
WAR_INJURED
EXTREME_POVERTY
```

Arabic labels:

```text
MARTYR            = شهداء الثورة
WAR_INJURED       = مصابو الحرب
EXTREME_POVERTY   = الأشد فقراً
```

Do not create separate database tables for the three categories.

Use a shared census-record model because the data is almost identical.

---

# UI Language

The application is Arabic-first.

Requirements:

- `dir="rtl"`
- Arabic labels everywhere
- excellent RTL layouts
- readable Arabic typography
- dates and numbers displayed clearly
- validation errors written in clear Arabic
- no unnecessary English exposed to end users

Source code, identifiers, variable names, database fields, commits, and developer documentation should remain in English.

---

# UX Philosophy

Municipality users may not be technical.

The application must feel obvious without training.

After login, MUNICIPALITY users should see three large cards:

```text
شهداء الثورة

مصابو الحرب

الأشد فقراً
```

Avoid complicated dashboards.

Avoid unnecessary sidebars.

Avoid deep menu hierarchies.

Prefer:

- large clickable targets
- obvious primary actions
- clear page titles
- one primary action per screen
- visible save feedback
- simple Arabic wording
- accessible contrast
- keyboard accessibility
- responsive behavior
- good mobile and desktop layouts

Do not sacrifice clarity for visual effects.

Animations should be minimal.

---

# Government Visual Identity

The UI should feel like an official government information system:

- formal
- calm
- trustworthy
- clean
- restrained
- accessible

Use centralized design tokens / CSS variables for branding.

If approved official logos, colors, fonts, or identity assets exist in the repository, use them.

If no approved assets exist:

- create a professional neutral government-style interface
- keep brand colors configurable
- reserve an obvious place for an official logo
- do NOT invent an official government seal, emblem, flag, or logo

The UI must still look polished without a logo.

---

# Code Quality

Use strict TypeScript.

Avoid `any`.

If `any` is genuinely required, document why.

Prefer:

- small functions
- explicit names
- clear service boundaries
- reusable validation
- consistent error handling
- simple control flow

Do not build abstractions before they are needed.

Avoid premature generic repositories or complex architecture frameworks.

NestJS modules should correspond to business responsibilities.

Controllers must remain thin.

Business rules belong in services/domain helpers, not controllers.

Database-specific access should remain localized.

---

# Validation

Validation must exist in the backend even if the frontend validates the same fields.

Never trust browser input.

Important rules include:

- category is required
- person name is required
- family member count must be a positive integer
- identifiers are strings, never numeric database types
- phone numbers are strings
- family book numbers are strings
- national ID numbers are strings
- leading zeroes must be preserved

For MARTYR and WAR_INJURED:

```text
maritalStatus = SINGLE | MARRIED
```

is required.

When:

```text
maritalStatus = MARRIED
```

spouse name is required.

When:

```text
maritalStatus = SINGLE
```

spouse name should be null/empty.

For EXTREME_POVERTY, marital status is not required.

Do not invent strict country-specific national-ID rules unless explicitly specified.

Use reasonable length and character validation without rejecting valid historical data.

---

# Deletion

Use soft deletion for census records.

Do not physically delete census records during normal application operations.

Use:

```text
deletedAt
```

Deleted records should be excluded from normal lists and exports.

SUPER_ADMIN may receive a restore capability.

---

# Authentication

Do not implement public signup.

SUPER_ADMIN creates municipality users.

Prefer secure same-origin cookie-based authentication.

Never store authentication tokens in:

- localStorage
- sessionStorage

Passwords must be hashed with a modern password hashing algorithm such as Argon2id.

Never log:

- passwords
- password hashes
- session tokens
- authentication cookies

Use secure cookie attributes in production:

- HttpOnly
- Secure
- SameSite
- Path

Authentication must support server-side revocation/logout.

---

# Security

This system contains personal data.

Treat security as a functional requirement.

Required principles:

- authentication on protected endpoints
- authorization on every protected resource
- municipality-level data isolation
- rate limiting on login
- input validation
- output encoding
- secure headers
- request-size limits
- upload-size limits
- `.xlsx` uploads only
- no secret values committed to Git
- `.env.example` contains placeholders only
- sensitive API responses should use `Cache-Control: no-store`
- no unnecessary analytics or external trackers
- no external third-party scripts by default
- never expose stack traces in production

Use Helmet or equivalent security headers.

For state-changing cookie-authenticated requests, protect against CSRF using an appropriate same-origin strategy.

---

# Logging and Audit

Application logs must not contain sensitive census data unnecessarily.

Audit events should identify:

- user
- municipality
- action
- entity ID
- category when relevant
- timestamp

Do not duplicate entire personal records inside audit logs.

For updates, record changed field names rather than storing previous and new sensitive values unless explicitly required.

Audit important actions such as:

```text
LOGIN
CREATE
UPDATE
DELETE
RESTORE
EXPORT
IMPORT
PASSWORD_RESET
MUNICIPALITY_CREATE
MUNICIPALITY_DISABLE
```

---

# Excel Import

Only SUPER_ADMIN can import Excel files.

Import must never immediately insert uploaded rows.

Required flow:

```text
Select municipality
↓
Select category
↓
Upload XLSX
↓
Parse
↓
Validate
↓
Preview
↓
Show errors and warnings
↓
Confirm
↓
Re-parse and re-validate on backend
↓
Transactional import
```

Never trust preview data sent back by the browser.

The confirm operation must validate the original file again.

Reject unsupported formats such as `.xls`, `.xlsm`, CSV, executable files, etc.

Apply:

- upload size limits
- row-count limits
- MIME/extension checks
- formula-cell handling
- duplicate detection

Never execute spreadsheet formulas.

---

# Excel Export

Both SUPER_ADMIN and MUNICIPALITY users may export Excel.

MUNICIPALITY exports must always be restricted to their own municipality.

Export `.xlsx`, not CSV.

Arabic exports must have:

- right-to-left worksheet layout
- Arabic headers
- readable column widths
- correctly aligned Arabic text
- text formatting for identifiers
- preserved leading zeroes
- generated sequence numbers
- municipality information
- area information
- export date

Protect against spreadsheet formula injection when exporting user-provided text.

Text beginning with spreadsheet formula characters must be safely escaped.

---

# Excel Canonical Headers

Maintain Excel header definitions in one centralized location.

Do not duplicate header strings across controllers/services/components.

Canonical MARTYR headers:

```text
تسلسل
الاسم الثلاثي للشهيد
عازب/متزوج
الاسم الثلاثي للزوجة
رقم البطاقة الشخصية
رقم دفتر العائلة
عدد أفراد الأسرة
رقم الجوال
ملاحظات
```

Canonical WAR_INJURED headers:

```text
تسلسل
الاسم الثلاثي للمصاب
عازب/متزوج
الاسم الثلاثي للزوجة
رقم البطاقة الشخصية
رقم دفتر العائلة
عدد أفراد الأسرة
رقم الجوال
ملاحظات
```

Canonical EXTREME_POVERTY headers:

```text
تسلسل
الاسم الثلاثي للزوج
الاسم الثلاثي للزوجة
رقم البطاقة الشخصية
رقم دفتر العائلة
عدد أفراد الأسرة
رقم الجوال
ملاحظات
```

The importer may accept well-known legacy header variants, but exports must always use canonical headers.

---

# Arabic Excel Handling

For header matching only, importer normalization may handle:

- Arabic and Western digits
- repeated spaces
- non-breaking spaces
- harmless Unicode differences
- `عدد افراد الاسرة` vs `عدد أفراد الأسرة`
- `الحالة الاجتماعية` vs `عازب/متزوج`
- common historical header spelling mistakes

Do NOT aggressively normalize actual people's names.

Person names should retain their entered spelling except safe whitespace trimming.

---

# Database Changes

Use Prisma migrations.

Do not use `prisma db push` as a substitute for production migrations.

Every schema change should have a migration.

Use database constraints where they meaningfully protect data integrity.

Use indexes for common access patterns such as:

```text
(municipalityId, category)
nationalId
familyBookNumber
phone
```

Do not add database uniqueness constraints for uncertain business rules without explicit confirmation.

---

# Testing

Critical security and business behavior must have automated tests.

At minimum test:

1. MUNICIPALITY cannot read another municipality's records.
2. MUNICIPALITY cannot modify another municipality's records.
3. MUNICIPALITY cannot delete another municipality's records.
4. MUNICIPALITY cannot export another municipality's records.
5. MUNICIPALITY cannot call import endpoints.
6. SUPER_ADMIN can access cross-municipality data.
7. invalid census records are rejected.
8. marital-status rules work correctly.
9. soft deletion works.
10. Excel import rejects invalid headers/files.
11. Excel preview does not write records.
12. Excel confirmed import validates again.
13. Excel exports preserve Arabic and leading zeroes.
14. duplicate import handling works.
15. authentication and logout work correctly.

Add frontend tests for critical form behavior when reasonable.

---

# Dependency Policy

Use maintained, stable dependencies.

Avoid deprecated or end-of-life versions.

Do not use:

```text
npm audit fix --force
```

as an automatic security strategy.

Do not add npm overrides merely to silence audit warnings.

Understand the dependency tree first.

After meaningful dependency changes run:

```text
npm audit --omit=dev
```

Production vulnerabilities must be investigated before declaring work complete.

Keep lockfiles committed.

---

# Required Validation Before Completion

For substantial changes, run the applicable commands:

```text
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

Also run Prisma migration/validation checks.

Do not claim tests passed unless they were actually executed successfully.

If something cannot be executed because of the environment, state exactly what could not be verified.

---

# Git and Change Discipline

Inspect existing code before modifying it.

Do not blindly delete user-authored work.

Do not rewrite unrelated files.

Do not make unrelated refactors while implementing a feature.

Preserve Git history.

Before finishing, inspect:

```text
git diff
git status
```

Make sure generated secrets, database files, build output, uploads, or local environment files are not accidentally staged.

---

# Documentation

Keep README instructions current.

Document:

- prerequisites
- environment variables
- local development
- database migration
- admin bootstrap
- frontend build
- backend build
- production deployment
- Nginx setup
- backup
- restore
- security-related configuration

Documentation should match the actual implementation.

---

# Decision Rule

When choosing between:

```text
clever + complex
```

and:

```text
simple + explicit + maintainable
```

choose the second option unless there is a measurable reason not to.

This is a small government census application. Reliability, usability, security, and maintainability matter more than architectural novelty.