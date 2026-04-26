# Random Profiles examples

Copy-pastable scripts and configs for using the [Random Profiles API](https://random-profiles.com) in real codebases. Each file is standalone — drop it into your project, set `RANDOM_PROFILES_API_KEY`, and run.

Get a free API key at [random-profiles.com](https://random-profiles.com) (100 profiles + 500 images + 100 companies per day, no credit card).

## Code examples

### Seed scripts (databases)

| File | What it does |
|---|---|
| [`seed-prisma.ts`](./seed-prisma.ts) | Drops 1,000 users + 1,000 companies into a Prisma + Postgres DB with foreign keys preserved. Idempotent (upsert by UUID). Includes a suggested `schema.prisma`. |
| [`seed-supabase.ts`](./seed-supabase.ts) | Same idea against a Supabase Postgres project using `@supabase/supabase-js`. Includes the SQL schema to paste into the Supabase SQL editor. |

### Test fixtures

| File | What it does |
|---|---|
| [`playwright-fixture.ts`](./playwright-fixture.ts) | Playwright test fixture that hands each test a deterministic fake user + company. Hash-of-test-title becomes the `?seed=` value, so the same test always gets the same person across CI runs (failures are replayable). One HTTP call per worker. |

## AI agent integrations

| File | What it does |
|---|---|
| [`mcp-claude-demo.md`](./mcp-claude-demo.md) | Wire `random-profiles-mcp` into Claude Desktop or Claude Code so the agent fetches profiles directly from chat. |
| [`mcp-cursor-demo.md`](./mcp-cursor-demo.md) | Same, for Cursor's MCP integration in Composer / Chat. |

## Common patterns

All scripts assume:

```bash
export RANDOM_PROFILES_API_KEY="rp_your_key_here"
```

The `random-profiles-types` package is used for TypeScript typing — it's zero-runtime, so it adds nothing to your bundle:

```bash
npm install -D random-profiles-types
```

Pagination — the per-request cap is 100 profiles or 100 companies, so to seed 1,000 we loop 10 times with `?seed=0..9` for deterministic ordering:

```ts
for (let offset = 0; offset < 10; offset++) {
  const res = await fetch(
    `https://random-profiles.com/v1/profiles?count=100&seed=${offset}`,
    { headers: { "X-API-Key": process.env.RANDOM_PROFILES_API_KEY! } },
  );
  // …
}
```

Field filtering — to keep responses small, request only what you need with `?fields=`:

```text
?fields=name,email,phone,address,job,relationships
```

Available groups for `/v1/profiles`: `name`, `email`, `phone`, `identity`, `bio`, `social`, `physical`, `job`, `address`, `financial`, `interests`, `education`, `photo`, `network`, `documents`, `vehicle`, `contact`, `digital`, `relationships`, `meta`.

For `/v1/companies`: `name`, `industry`, `size`, `location`, `contact`, `social`, `financial`, `tech`, `leadership`, `legal`, `operations`, `product`, `relationships`, `meta`.

Relationships — both profiles and companies expose a cross-resource graph under the `relationships` field group:

- `Profile.relationships.company_uuid` — which company they work at
- `Profile.relationships.colleague_uuids` — up to 5 other people at the same company
- `Company.relationships.employee_uuids` — sample of up to 30 people assigned to this company

The seed scripts use this to set foreign keys correctly.

## Run

```bash
# Prisma
npx prisma migrate dev --name init
npx tsx examples/seed-prisma.ts

# Supabase (after running the SQL in the editor)
npx tsx examples/seed-supabase.ts

# Playwright — import the fixture from your tests
import { test, expect } from './examples/playwright-fixture';
```

## Got a use case we should add?

Open an issue at [github.com/gusdeboer/random-profiles-mcp](https://github.com/gusdeboer/random-profiles-mcp/issues) or email [support@random-profiles.com](mailto:support@random-profiles.com).
