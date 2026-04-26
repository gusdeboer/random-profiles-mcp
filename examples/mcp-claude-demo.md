# Using Random Profiles with Claude (Desktop / Code)

Random Profiles ships an MCP server, so Claude can fetch fake profiles, companies, photos, and usage info directly in a chat — no manual `curl` or copy-paste.

## 1. Get a free API key

Go to [random-profiles.com](https://random-profiles.com) and enter your email. The key is mailed to you. It looks like `rp_` followed by 32 hex chars.

## 2. Wire it into Claude

### Claude Desktop

Edit your config file (location varies per OS — Claude Desktop → Settings → Developer → Edit Config):

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

Restart Claude Desktop. You should see "random-profiles" in the tools icon near the chat input.

### Claude Code (CLI)

In your project root, create or edit `.mcp.json`:

```json
{
  "mcpServers": {
    "random-profiles": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "random-profiles-mcp"],
      "env": {
        "RANDOM_PROFILES_API_KEY": "rp_your_key_here"
      }
    }
  }
}
```

Restart `claude` — the tools show up in the tools panel.

## 3. Try it — example prompts

### Profiles

> "Give me 5 random US profiles with just name, email, and phone."

> "Generate 10 female profiles between 25 and 35 years old from Germany, France, or the UK."

> "Show me a random profile photo at 256px."

> "Get the photo for profile UUID a1b2c3d4-e5f6-7890-abcd-ef1234567890."

### Companies

> "Give me 5 Technology companies from the US, size 201-500 or 501-1000."

> "Find 10 Finance companies in Europe with leadership and financial fields only."

> "Generate 20 Healthcare companies for a seed script — I need name, industry, location, and leadership."

> "Look up company UUID 7d3063d3-b62b-41ef-8e60-f5b50dac8ee0."

### Seeding a test database

> "Generate 50 profiles with a seed of 42 so the same data comes back every run, then write a Prisma seed script that inserts them into a `users` table. Map `name.first`→`firstName`, `name.last`→`lastName`, `email`→`email`."

> "Generate 30 B2B companies across Technology and Finance (seed 7), then write a SQL INSERT statement for a `customers` table with columns: id, name, industry, country, annual_revenue."

### Usage awareness

> "How much of my daily API quota have I used today?"

Claude calls `get_usage` and shows the answer.

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

## 5. Troubleshooting

- **"No tools available"** — check the `env.RANDOM_PROFILES_API_KEY` is set in the MCP config, not as a shell env var. The `npx` command runs in a fresh environment.
- **429 rate-limited** — free tier is 100 profiles + 500 images + 100 companies per day. Upgrade on the `/pricing` page or wait until midnight UTC.
- **Old tools list cached** — after updating the package (`npx -y random-profiles-mcp@latest`), restart Claude so it re-fetches the tool schema.
