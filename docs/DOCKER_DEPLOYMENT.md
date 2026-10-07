# Docker build and deployment

## Architecture

- PostgreSQL 18 and the NestJS backend run in Linux containers.
- The `web` Nginx container serves the built frontend and proxies `/api/` to the private backend. Host Nginx terminates HTTPS and proxies to `127.0.0.1:8080` (or configured WEB_PORT).
- Only Nginx exposes the application to the Internet, using HTTPS and a single origin.
- The database uses the persistent Compose volume. The backend runs as the `node` user, with a read-only filesystem, an init process and dropped capabilities.
- The `migrations` service is an explicit one-shot tool. Starting the backend never applies migrations or creates users.

## 1. Prepare without installing packages

On Windows/PowerShell, from the repository root:

```powershell
./scripts/prepare-docker.ps1
```

The script checks the Linux Docker engine, validates Compose using `.env.example`, builds both applications using the **already-installed** dependencies, verifies compiled backend entry points, and runs `docker compose build --check`. The latter checks the Dockerfile without executing `RUN` instructions. It can access the registry to resolve base image metadata; it does not install npm packages or create application images. Both application manifests and lockfiles are hashed before/after the checks.

Docker Compose must support `build --check` (the installed Compose 2.40 supports it). The script refuses to install missing dependencies. It does not start/stop containers, run migrations, read database records or overwrite environment files.

Equivalent preparation on Linux, with existing dependencies:

```sh
npm run build --prefix backend
npm run build --prefix frontend
docker compose --env-file .env.example --profile tools config --quiet
docker compose --env-file .env.example --profile tools build --check backend web migrations
```

## 2. Build the images after approval

**Under the current frozen dependency policy, obtain explicit approval before this step.** The Dockerfile runs `npm ci` against the existing lockfile inside Linux images. It does not change the host dependency tree, versions, overrides or lockfiles. A missing Linux binary or installation failure must be investigated without changing package versions automatically.

```powershell
docker compose --env-file .env.example --profile tools build backend web migrations
docker image inspect count-daraa-backend:local --format '{{.Config.User}}'
```

Default image names:

- `count-daraa-backend:local`: production dependencies, generated Prisma Client and compiled JavaScript, including `dist/bootstrap.js`.
- `count-daraa-tools:local`: build tooling, Prisma CLI, schema and migration history.
- `count-daraa-web:local`: built frontend and its internal Nginx proxy.

For release tags, set `COUNT_DARAA_IMAGE_TAG` in the shell **before both build and deployment**. PowerShell example:

```powershell
$env:COUNT_DARAA_IMAGE_TAG = 'v1'
```

Use the same tag in the deployment host's root environment. No registry push or image export occurs automatically. Frontend assets ship inside the `web` image.

## 3. Configure the deployment host

Use the root `.env.example` as the template for a protected root `.env` on the production host. Do not copy over an existing working environment file. Required values:

- `POSTGRES_PASSWORD`: a strong URL-safe database password. For an existing PostgreSQL volume it **must match the existing password**; the initialization variable does not rotate an existing database password.
- `APP_ORIGIN`: the exact public HTTPS origin, such as your actual domain, with no path/query/fragment. A local HTTP development origin cannot start a production backend.
- `COUNT_DARAA_IMAGE_TAG`: the built release tag (`local` if omitted).
- Optional session/import limits: see the root example and README.

Only the root environment is used by Compose. `backend/.env` is for host development; it is not copied into images. Web and PostgreSQL ports bind to loopback only; the backend has no published port. Use the same project name for successive deployments to retain the correct volume. A new production host gets its own database; building an image does not transfer local development records.

## 4. Backup, migrate and start

On the **intended deployment host**, using its protected root environment and already-built images:

```sh
docker compose config --quiet
docker compose up -d db
docker compose --profile tools run --rm --pull never migrations
docker compose up -d --no-build --pull never backend web
docker compose ps
```

Ensure the tools image was built in step 2 before running the migration command; do not rely on Compose to build a missing image during deployment. `run` has no `--no-build` option in Compose 2.40; `up` does. For an existing database, take a backup **before** the migration command using `scripts/backup.sh` or `scripts/backup.ps1`. The tooling command runs `prisma migrate deploy`; it preserves applied migration history and fails on migration errors. Never use `db push`, `migrate reset`, `migrate dev` or `docker compose down -v` for production deployment.

Do not run the above on the local development database merely to test a container. Use `count_daraa_test` for automated integration tests. Image builds and configuration checks require no database changes.

Check readiness:

```sh
curl --fail http://127.0.0.1:8080/api/health
docker compose logs --tail 50 backend web
```

Keep logs private. A green Dockerfile check or successful host build does not verify Linux native modules, container startup, database connectivity or health. Verify these after the first actual image build/start.

## 5. Create the first administrator

Set `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` transiently in the operator's shell, without logging or putting the password in command arguments. Then:

```sh
docker compose exec \
  -e BOOTSTRAP_ADMIN_USERNAME -e BOOTSTRAP_ADMIN_PASSWORD \
  backend node dist/bootstrap.js
```

PowerShell supports the same command on one line:

```powershell
docker compose exec -e BOOTSTRAP_ADMIN_USERNAME -e BOOTSTRAP_ADMIN_PASSWORD backend node dist/bootstrap.js
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
Remove-Item Env:BOOTSTRAP_ADMIN_USERNAME
```

Bootstrap hashes the password and is idempotent; it does not reset an existing administrator's password. Remove both variables from the operator shell afterward (Linux: `unset BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD`).

## 6. Publish the frontend through Nginx

No host copy of `frontend/dist` is needed. Configure `nginx/count-daraa.conf` with your actual domain, valid certificate paths and configured WEB_PORT on an Nginx 1.26+ Linux host:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Preserve the same-origin `/api/` proxy and security headers. Set `APP_ORIGIN` to the same HTTPS origin users open in the browser. Test login/logout, the three municipality categories, Excel export, and admin import preview/confirmation through HTTPS before opening the service to committees.

## Updates and recovery

Build/tag matching backend, tools and web images. Keep the previous images until the release is verified. Back up before applying migrations. Roll back application images only if compatible with the already-applied schema; do not assume a destructive down migration exists. Backup/restore commands and scheduled backup examples are in [README](../README.md#backup-restore-and-recovery).
