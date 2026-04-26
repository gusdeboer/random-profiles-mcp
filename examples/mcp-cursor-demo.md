# Using Random Profiles with Cursor

Cursor speaks MCP, so it can use Random Profiles to generate fake users, companies, and photos right from Composer or Chat — no copy-paste, no manual `curl`.

## 1. Get a free API key

Go to [random-profiles.com](https://random-profiles.com), enter your email. The key is mailed to you and looks like `rp_` followed by 32 hex characters.

## 2. Configure Cursor

Cursor reads MCP configs from `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-specific).

```json
{
  "mcpServers": {
    "random-profiles": {
      "command": "npx",
      "args": ["-y", "random-profiles-mcp"],
      "env": {
        "RANDOM_PROFILES_API_KEY": "rp_your_key_here"
      }
    }
  }
}
```

Open **Cursor Settings → MCP** and confirm `random-profiles` shows up green. If it's red, click the row for error details (usually a missing API key).

## 3. Try it — example prompts in Composer

### Seed data for the project you're working on

> "My schema has a `users` table with fields: id, first_name, last_name, email, country, city, created_at. Generate 50 realistic test rows using the random-profiles MCP and write them to `seed/users.sql`."

Cursor calls `get_profiles` with `count=50` and the right `fields=` subset, then writes the SQL for you.

> "Same thing for a `companies` table (name, legal_name, industry, country, employees). 30 rows, deterministic (seed 42) so re-running tests is stable."

Cursor calls `get_companies` with `count=30&seed=42`.

### Fixtures for tests

> "Write a Playwright fixture that creates 5 test users before each test using the random-profiles MCP, seed 1."

Cursor generates `tests/fixtures/users.ts` with the fetched profile data inline.

### Populate Storybook / design mocks

> "For this `<UserCard>` component, give me 3 sample users (non-binary, age 25–40, US) and add them as Storybook stories."

Cursor fetches the profiles and writes `UserCard.stories.tsx`.

### One-off lookups

> "Pull a single fake company I can use in a keynote slide — something Finance, UK-based, public."

Cursor calls `get_companies` with `industry=Finance&country=GB&count=1` and reads back the key details.

## 4. Available tools

| Tool | Purpose |
|---|---|
| `get_profiles` | List random profiles with filters |
| `get_profile` | Single profile by UUID |
| `get_companies` | List random companies with filters |
| `get_company` | Single company by UUID |
| `get_random_image` | Random profile photo as base64 JPEG |
| `get_image` | Photo for a specific UUID |
| `get_usage` | Your tier and daily quota status |

## 5. Tips for best results in Cursor

- **Pin a seed for deterministic runs**: `seed=42` means re-running regenerates identical data. Essential for reproducible tests.
- **Ask for specific field groups**: telling Cursor "only name, email, job" keeps the response small so it fits in context and the model maps it to your schema more accurately.
- **Company data pairs well with Prisma/Drizzle seed scripts**: the `leadership`, `financial`, `tech`, and `legal` groups map cleanly to columns in a SaaS B2B schema.

## 6. Troubleshooting

- **Server fails to start** — verify `RANDOM_PROFILES_API_KEY` is set in the `env` block of `mcp.json`, not your shell. `npx` runs in an isolated environment.
- **"Tool not found: get_companies"** — you're on an older version of the package. Force a refresh: `npx clear-npx-cache && npx -y random-profiles-mcp@latest` and restart Cursor.
- **429 daily limit** — upgrade at `/pricing` or wait until midnight UTC for the counter to reset.
