# random-profiles-mcp

MCP server for the [Random Profiles API](https://random-profiles.com) — generate fake user profiles and companies directly from AI agents like Claude.

## Setup — zero config

Just install the MCP server and talk to it. The first time you ask for
profiles, the agent will prompt you for an email once, claim a free key on
your behalf, cache it locally, and use it for every future request. The key
is also emailed to you as a receipt.

Add to your Claude Code MCP config (`.mcp.json`):

```json
{
  "mcpServers": {
    "random-profiles": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "random-profiles-mcp"]
    }
  }
}
```

Restart Claude Code and ask _"give me 5 random user profiles"_ — the agent
will handle the key handshake automatically. No browser, no copy-paste.

The key is cached at `~/.random-profiles/config.json` (mode `0600`) so you
only do this once per machine.

### Prefer to bring your own key?

If you already have an API key (or want to use a specific one for billing),
set it via env var and skip the claim flow entirely:

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

The env var takes precedence over the cached key.

## Tools

| Tool | Description |
|------|-------------|
| `claim_api_key` | Claim a free API key using an email address (response returns the key; the agent also emails a copy as a receipt). Only used on first run when no key is configured — cached afterward. |
| `get_profiles` | Get random user profiles with filters (count, gender, country, age range, fields) |
| `get_profile` | Get a single profile by UUID |
| `get_companies` | Get random fake companies with filters (count, industry, country, size, fields) |
| `get_company` | Get a single company by UUID |
| `get_random_image` | Get a random profile photo (JPEG, optional size) |
| `get_image` | Get a specific profile photo by UUID (JPEG, optional size) |
| `get_usage` | Check your API key usage, tier, and daily limits |

## Field Groups

**Profiles**: name, email, phone, identity, bio, social, physical, job, address, financial, network, documents, vehicle, contact, digital, interests, education, photo, relationships, meta

**Companies**: name, industry, size, location, contact, social, financial, tech, leadership, legal, operations, product, relationships, meta

The `relationships` group returns cross-resource UUIDs: profiles have `company_uuid` + `colleague_uuids`, companies have `employee_uuids`. Chain tools together to hydrate the graph (e.g. "give me 5 companies, then their employees").

## Image formats

Both `get_profiles` and `get_companies` accept an optional `photo_format` / `logo_format` argument (`jpg` or `webp`). WebP is ~30% smaller than JPG with equivalent perceived quality and is supported by 96%+ of browsers. Default stays `jpg` for maximum compatibility.

## Examples

**Profiles**

> "Give me 5 random US profiles"

> "Generate 10 female profiles between ages 25-35 from Germany"

> "Get me profiles with only name and email fields"

> "Show me a random profile photo"

**Companies**

> "Give me 5 fake Technology companies from the US"

> "Generate 10 Healthcare companies with 51-200 employees"

> "Get 20 companies with only name, industry, and leadership fields"

> "Give me 3 Finance companies from the UK with a fixed seed of 42"

> "Give me 10 companies with 128px logos (for an icon grid)"

The `logo_size` argument on `get_companies`/`get_company` picks the size variant in `meta.logo_url` — same pattern as `photo_size` on profiles. Valid values: `64`, `128`, `256`, `512`, `1024` (default).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RANDOM_PROFILES_API_KEY` | Yes | Your API key (get one at random-profiles.com) |

## See also

- [`random-profiles-types`](https://www.npmjs.com/package/random-profiles-types) — TypeScript types for the API response shapes, if you're calling the API directly from TypeScript.
- [`random-profiles`](https://www.npmjs.com/package/random-profiles) — CLI for the same API.

## License

MIT
