# Contributing

Full flow, rollback and environment details: [`docs/RELEASING.md`](docs/RELEASING.md).

## Before you open a PR

Run what CI runs (use `node_modules/.bin/...` or `pnpm exec`):

```sh
pnpm exec prisma validate
pnpm typecheck        # next typegen && tsc --noEmit
pnpm lint
pnpm test
pnpm build            # catches server/client boundary errors
```

If you change an API route or its schema, run `pnpm openapi:generate` and commit `openapi/prodlys-v1.json`.
If you change `prisma/schema.prisma`, create a migration with `pnpm db:migrate`; never edit a migration that is
already on `main`.

## PR titles

PRs are squash-merged and the PR title becomes the commit message, which drives the version number and the
changelog. Start the title with one of these, then a short lower-case description:

| Prefix | Use for | Release effect |
| --- | --- | --- |
| `feat:` | A new capability users or API clients can see | minor |
| `fix:` | A bug fix | patch |
| `perf:` | A speed or resource improvement | patch |
| `refactor:` | Code change with no behaviour change | patch |
| `docs:` | Documentation only | none |
| `test:` | Tests only | none |
| `ci:` | Workflows, tooling, dependabot | none |
| `chore:` | Anything else (dependencies, housekeeping) | none |

An optional scope is fine (`fix(billing): ...`). Mark a breaking change with `!` (`feat!: ...`) and explain it in the
PR body. Examples: `feat: purchase order PDF`, `fix: purchase pages crash for viewers`.

Bots are exempt: Dependabot titles (`chore: ...`, `ci: ...`) and release-please PRs are generated already.

## Merging

Use "Squash and merge" and keep the PR title as the commit message. Railway deploys `main` automatically, so do not
merge on a red check.
