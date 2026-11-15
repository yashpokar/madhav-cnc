# Releasing Prodlys

How a change gets from a branch to production, how it is checked on the way, and how to undo it.

```
PR -> CI -> squash merge -> Railway auto-deploys main -> post-deploy smoke -> release PR -> tag + GitHub Release
```

Nothing in GitHub Actions deploys anything. Railway builds and deploys every push to `main` by itself; GitHub
only checks the change before the merge and checks production after it.

## 1. The flow

1. **Open a PR against `main`.** The title must start with `feat`, `fix`, `chore`, `refactor`, `docs`, `perf`,
   `test` or `ci` (see `CONTRIBUTING.md`). The `PR title` workflow enforces it.
2. **CI runs** (`.github/workflows/ci.yml`), four jobs in parallel; a new push cancels the run in progress:

   | Job (check name) | What it does |
   | --- | --- |
   | `Static checks` | `prisma validate`, `next typegen`, `tsc --noEmit`, `eslint` |
   | `Unit tests` | `vitest run`, which includes the guard that fails when `openapi/prodlys-v1.json` is stale |
   | `Migration safety` | on a Postgres 17 container: no already-merged migration edited or deleted, every migration applies to an empty database, `prisma migrate diff --from-migrations` against `schema.prisma` shows no drift |
   | `Build and smoke` | `next build` (catches server/client boundary errors such as a server component calling a client function), then `migrate deploy`, `next start` and `scripts/smoke.mjs` |

   `scripts/smoke.mjs` checks `/sign-in`, `/api/v1/meta` (envelope and `release`), `/api/v1/me` returning 401,
   `/api/v1/openapi.json`, an unknown `/i/<token>` returning 404, bad sign-in being rejected, and tenancy: it signs up
   two users, creates two companies, seeds one customer in each (`scripts/smoke-seed.ts`, through the scoped Prisma
   client) and fails if either company can see the other's customer.
3. **Merge with "Squash and merge"**, keeping the PR title as the commit message. Release-please reads the commits
   on `main`; a plain merge commit ("Merge pull request #92 ...") carries no type and is ignored.
4. **Railway deploys `main`.** Migrations run from the start command (section 4).
5. **Post-deploy check** (`.github/workflows/post-deploy.yml`) starts on the same push. It polls
   `https://app.prodlys.com/sign-in` for up to 15 minutes until the page's `data-dpl-id` equals the pushed commit SHA
   (the app sets `deploymentId` from `RAILWAY_GIT_COMMIT_SHA`), then runs the smoke in read-only mode. A red run
   means the commit is not live or production is unhealthy; GitHub emails the pusher. Override the URL with a
   repository variable `PROD_URL`. It can be started by hand (Actions, Post-deploy check, Run workflow).
6. **Release PR.** `release-please` keeps one open PR titled `chore: release x.y.z` that bumps `package.json` and
   `CHANGELOG.md` from the merged titles (`feat` = minor, `fix`/`perf` = patch; while the version is 0.x a
   breaking change bumps minor). Merge it when you want a named release: it creates the tag `vX.Y.Z` and a GitHub
   Release. Merging it triggers a normal deploy (only the version string changes).
7. **Version in the running app.** `GET /api/v1/meta` returns `release: { version, commit, builtAt }`, and Settings,
   Business profile shows `Prodlys v<version> . <commit>` at the bottom. Support can compare it with the tag.

A release PR opened by the default `GITHUB_TOKEN` does not trigger other workflows, so CI does not run on it. It
only changes `package.json` and the changelog, so this is acceptable; for stricter control give release-please a
personal access token (owner decision, see section 7).

## 2. Hotfix

1. Branch from `main`, make the smallest possible fix, open a PR titled `fix: ...`.
2. CI must still pass; do not bypass it, it is the cheapest check available. Merge (squash).
3. Watch the `Post-deploy check` run. Merge the release PR afterwards if you want a patch tag.
4. If the fix is not ready and production is broken, roll back first (section 3), then fix calmly.

## 3. Rollback

Pick the fastest that applies, then follow up with a revert so `main` matches production again.

- **Railway dashboard (fastest, about a minute).** Project `madhav-cnc`, service `web`, Deployments. Open the last
  good deployment, `...` menu, Redeploy (or Rollback if shown). The old image is started again.
- **Railway CLI.** `railway link` once, then `railway deployment list` to find the last good deployment, and
  `railway redeploy` (or the dashboard) to start it again. Re-run the post-deploy check by hand afterwards.
- **Revert in git.** `git revert <merge-or-squash-sha>`, open a PR titled `fix: revert ...`, merge it, and Railway deploys the reverted `main`.

Rolling the code back does not roll the database back. If the bad deploy included a migration, the previous code
must still work with the new schema, which is why migrations are additive only (section 4).

Reverting commits that hold a migration: do not delete or edit the migration file. Add a new migration that undoes
it, or leave the additive change in place.

## 4. Database migrations

Rules:

- **Additive only.** Add tables, add nullable columns or columns with defaults, add indexes. Never rename or drop in
  one step.
- **Expand / contract** for anything destructive: (1) expand: add the new column or table and write to both;
  (2) migrate data and switch reads; (3) release; (4) contract: drop the old column in a later release, once no
  deployed code reads it. The previous deployment must keep working against the new schema, because Railway
  starts the new container while the old one still serves, and rollback needs it.
- **Never edit or delete a migration that has been merged.** Fix mistakes with a new migration. CI fails the PR
  (`Migration safety`) if a file under `prisma/migrations` that exists on `main` is modified or deleted.
- Create migrations with `pnpm db:migrate` and commit the generated folder together with the `schema.prisma` change;
  CI fails on drift between the two.
- Review the SQL in the migration. Large backfills belong in a separate step, not inside the migration.

How they run: the `web` service start command is `pnpm exec prisma migrate deploy && pnpm start`, so every deploy
applies pending migrations before the server starts. They run from the start command, not a pre-deploy hook, because
the hook did not fire; do not add a `railway.json` (it would override the start command). `prisma` and `dotenv` must stay
in `dependencies` so they exist at runtime.

If a migration fails: the start command exits, the new container never becomes healthy and **Railway keeps the
previous deployment serving**; users see no outage. Open the failed deployment's logs, then either push a corrected
*new* migration (if the failed one rolled back cleanly, Prisma retries pending ones next deploy; a half-applied
failed migration needs `prisma migrate resolve`, see the Prisma docs, run with the production database URL as in
your Railway DB access notes). Never fix it by editing the failed file on `main` if it had already been applied
anywhere.

## 5. Environment variables (Railway, service `web`)

Set in the Railway dashboard under service `web`, Variables, as references where possible (for example
`${{Postgres.DATABASE_URL}}`, `https://${{RAILWAY_PUBLIC_DOMAIN}}`). After changing a variable, redeploy;
the running container keeps the old values.

| Name | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (reference `${{Postgres.DATABASE_URL}}`) |
| `DIRECT_DATABASE_URL` | no | Used by Prisma CLI (migrations) instead of `DATABASE_URL` if set, for example to bypass a pooler |
| `BETTER_AUTH_SECRET` | yes | Secret used to sign sessions. Changing it signs everyone out |
| `BETTER_AUTH_URL` | yes | Public URL of the app (`https://app.prodlys.com`); used for auth callbacks and PhonePe return URLs |
| `PUBLIC_BASE_URL` | recommended | Origin used in shared links (quotation, order tracking, invoice links). Never localhost or a private address in production |
| `ALLOWED_ORIGINS` | no | Comma-separated extra origins allowed to post server actions |
| `ALLOW_ALL_ORIGINS` | no | Default `true`. `false` restricts server actions to `ALLOWED_ORIGINS` only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enable Google sign-in when both are set |
| `S3_BUCKET`, `S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | yes for uploads | Railway Storage Bucket (references `${{madhav-cnc-uploads.*}}`) |
| `BILLING_ENFORCED` | no | `true` blocks issuing invoices past the plan quota. Default `false` (see `docs/billing.md`) |
| `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION` | for paid plans | PhonePe merchant credentials. Without them the upgrade buttons say "Paid plans open soon" |
| `PHONEPE_ENV` | no | `sandbox` (default) or `production` |
| `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD` | for paid plans | Pair configured on the PhonePe webhook |
| `BILLING_PROVIDER` | no | `mock` for local development and tests only. Never in production |
| `PRODLYS_MIN_APP_VERSION_IOS`, `PRODLYS_MIN_APP_VERSION_ANDROID` | no | Lowest mobile app version allowed to call the API (default `0.0.0`) |
| `PRODLYS_LATEST_APP_VERSION` | no | Newest published app version, shown as the soft "update available" prompt (default `1.0.0`) |
| `RAILWAY_GIT_COMMIT_SHA` | set by Railway | Commit being served; becomes the Next.js `deploymentId`, `release.commit` and what post-deploy waits for. Do not set by hand |
| `SEED_*`, `API_DB_TEST` | no | Local scripts and tests only. Not for production |

GitHub side: optional repository variable `PROD_URL` (default `https://app.prodlys.com`). No secrets are needed by
any workflow.

## 6. Mobile force-update controls

The mobile apps call `GET /api/v1/meta` first and compare their version with:

- `PRODLYS_MIN_APP_VERSION_IOS` / `PRODLYS_MIN_APP_VERSION_ANDROID`: apps below this version (sent as `X-Platform` and
  `X-App-Version`) get `426 UPGRADE_REQUIRED` from every endpoint except `/meta`, which is never gated (a hard block).
- `PRODLYS_LATEST_APP_VERSION`: newest version available; apps below it can show an optional prompt.

These are plain Railway variables, so they change without a code release. A variable change needs a redeploy to take
effect (Railway does this when you save, unless you pass `--skip-deploys`):

```sh
railway link                      # once: workspace Techardent, project madhav-cnc, environment production, service web
railway variables --service web --set PRODLYS_LATEST_APP_VERSION=1.4.0
railway variables --service web --set PRODLYS_MIN_APP_VERSION_IOS=1.3.0 --set PRODLYS_MIN_APP_VERSION_ANDROID=1.3.0
railway variables --service web          # confirm
curl -s https://app.prodlys.com/api/v1/meta   # confirm minAppVersion / latestAppVersion
```

Order for a forced update: publish the new app in both stores, raise `PRODLYS_LATEST_APP_VERSION`, wait until most
users have it, then raise the `MIN` values. Raising `MIN` before the store release is live locks users out. To undo,
set the `MIN` variables back to `0.0.0`. There is no admin UI by design.

## 7. Owner setup (one time, GitHub settings; not done by code)

1. **Branch protection** for `main` (Settings, Branches, Add rule, or a ruleset):
   - Require a pull request before merging (CODEOWNERS review optional while you are the only maintainer).
   - Require status checks to pass, and select exactly: `Static checks`, `Unit tests`, `Migration safety`,
     `Build and smoke`, `Conventional PR title`. Require branches to be up to date before merging.
   - Block force pushes and deletions.
2. **Merge button** (Settings, General, Pull Requests): enable only "Allow squash merging" with default message
   "Pull request title"; disable merge commits and rebase merging. Release-please needs this.
3. **Actions permissions** (Settings, Actions, General, Workflow permissions): choose "Read and write permissions" and
   tick "Allow GitHub Actions to create and approve pull requests", otherwise release-please cannot open its PR.
4. **Optional**: a fine-grained personal access token saved as secret `RELEASE_PLEASE_TOKEN` (and used in
   `release-please.yml` as `token:`) so the release PR also runs CI.
5. **Vercel**: this repo contains `vercel.json` with `git.deploymentEnabled: false`, which stops Vercel from building on
   push. The Vercel project can also be disconnected or deleted in its settings; the owner decides.
