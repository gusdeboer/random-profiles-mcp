#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL =
	process.env.RANDOM_PROFILES_BASE_URL || "https://random-profiles.com";

// Key resolution order:
//   1. RANDOM_PROFILES_API_KEY env var (explicit, canonical)
//   2. ~/.random-profiles/config.json from a prior claim_api_key call
//   3. none — the agent must call claim_api_key(email) first, and every
//      other tool fails with a helpful hint pointing at that flow
const CONFIG_DIR = join(homedir(), ".random-profiles");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

function loadCachedKey(): string | null {
	try {
		if (!existsSync(CONFIG_PATH)) return null;
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		const parsed = JSON.parse(raw) as { key?: string };
		return typeof parsed.key === "string" && parsed.key.startsWith("rp_")
			? parsed.key
			: null;
	} catch {
		return null;
	}
}

function saveCachedKey(key: string, email: string): void {
	try {
		if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
		writeFileSync(
			CONFIG_PATH,
			JSON.stringify(
				{ key, email, created_at: new Date().toISOString() },
				null,
				2,
			),
			{ mode: 0o600 },
		);
	} catch (err) {
		console.error(`[random-profiles-mcp] Could not cache key: ${err}`);
	}
}

let currentKey: string | null =
	process.env.RANDOM_PROFILES_API_KEY || loadCachedKey();

function noKeyError(): string {
	return (
		"No API key is configured yet. To get a free key, ask the user for their " +
		"email address (you need the real one — the key will be emailed there as " +
		"a receipt), then call the claim_api_key tool with that email. The key is " +
		"cached automatically so this only happens once."
	);
}

async function apiRequest(
	path: string,
	params?: Record<string, string>,
): Promise<unknown> {
	if (!currentKey) throw new Error(noKeyError());
	const url = new URL(path, BASE_URL);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v !== undefined && v !== "") url.searchParams.set(k, v);
		}
	}

	const res = await fetch(url.toString(), {
		headers: { "X-API-Key": currentKey },
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`API error ${res.status}: ${body}`);
	}

	return res.json();
}

const server = new McpServer({
	name: "random-profiles",
	version: "1.4.3",
});

// ─── Instant key claim for AI-agent onboarding ──────────────────────────
//
// Why this tool exists, and how the agent should use it:
//
// Random Profiles normally issues keys by email (POST /v1/keys), which is
// fine for humans but impossible for AI agents — Claude can't read an
// inbox. This tool calls a dedicated POST /v1/keys/instant endpoint that
// returns the key in the response body (and still sends a receipt email).
//
// Expected agent behavior when no key is configured:
//   1. Any other tool returns a "no API key" error pointing the agent here.
//   2. Agent asks the user ONCE for their email address — this is a real
//      email (a receipt + record of the key is sent there), not a
//      throwaway; disposable domains are rejected server-side.
//   3. Agent calls `claim_api_key({ email })`. The returned key is cached
//      in ~/.random-profiles/config.json (mode 0600) so this only ever
//      happens once per machine.
//   4. Subsequent tool calls use the claimed key transparently.
server.tool(
	"claim_api_key",
	"Claim a free Random Profiles API key using an email address. Use this tool the FIRST time no key is configured — the key will be returned in the response and also emailed to the user as a receipt. Subsequent calls use the cached key automatically, so you only need to do this once per machine. ALWAYS ask the user for their real email before calling this — don't make one up.",
	{
		email: z
			.string()
			.email()
			.describe(
				"Real email address to receive the key receipt. Will be used as the account identifier for usage tracking and eventual upgrades. Disposable domains are rejected.",
			),
	},
	async ({ email }) => {
		try {
			const res = await fetch(new URL("/v1/keys/instant", BASE_URL), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = (await res.json()) as {
				key?: string;
				status?: string;
				error?: string;
			};
			if (!res.ok || !data.key) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								data.error ??
								`Failed to claim a key (HTTP ${res.status}). Try again in a minute — there's a rate limit on key creation per IP.`,
						},
					],
					isError: true,
				};
			}
			currentKey = data.key;
			saveCachedKey(data.key, email);
			return {
				content: [
					{
						type: "text" as const,
						text: `Got it — free API key for ${email} has been saved locally and will be used for all subsequent tool calls. A copy has also been emailed to ${email} as a receipt. Status: ${data.status ?? "created"}. You can now call other tools like get_profiles, get_companies, etc.`,
					},
				],
			};
		} catch (err) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Network error claiming key: ${err instanceof Error ? err.message : String(err)}`,
					},
				],
				isError: true,
			};
		}
	},
);

server.tool(
	"get_profiles",
	"Get random fake user profiles for testing and seed data. Returns realistic profiles with 100+ fields including names, jobs, addresses, financials, network data, documents, and more.",
	{
		count: z
			.number()
			.min(1)
			.max(100)
			.default(10)
			.describe("Number of profiles to return (1-100)"),
		gender: z
			.enum(["male", "female", "non-binary"])
			.optional()
			.describe("Filter by gender"),
		country: z
			.string()
			.optional()
			.describe(
				"Comma-separated country codes to include (US, GB, DE, FR, AU, BR, JP, IN, NG)",
			),
		exclude_country: z
			.string()
			.optional()
			.describe("Comma-separated country codes to exclude"),
		min_age: z.number().optional().describe("Minimum age filter"),
		max_age: z.number().optional().describe("Maximum age filter"),
		fields: z
			.string()
			.optional()
			.describe(
				"Comma-separated field groups to return (name, email, phone, identity, bio, social, physical, job, address, financial, network, documents, vehicle, contact, digital, interests, education, photo, relationships, meta). The `relationships` group returns company_uuid + colleague_uuids — use with get_companies / get_profile to walk the graph.",
			),
		photo_size: z
			.enum(["64", "128", "256", "512", "1024"])
			.optional()
			.describe("Photo size in pixels (default: 1024)"),
		photo_format: z
			.enum(["jpg", "webp"])
			.optional()
			.describe(
				"Image format for photo URL (default: jpg, webp is ~30% smaller)",
			),
		seed: z
			.number()
			.optional()
			.describe(
				"Seed for deterministic results — same seed returns same profiles",
			),
	},
	async ({
		count,
		gender,
		country,
		exclude_country,
		min_age,
		max_age,
		fields,
		photo_size,
		photo_format,
		seed,
	}) => {
		const params: Record<string, string> = {};
		if (count) params.count = String(count);
		if (gender) params.gender = gender;
		if (country) params.country = country;
		if (exclude_country) params.exclude_country = exclude_country;
		if (min_age !== undefined) params.min_age = String(min_age);
		if (max_age !== undefined) params.max_age = String(max_age);
		if (fields) params.fields = fields;
		if (photo_size) params.photo_size = photo_size;
		if (photo_format) params.photo_format = photo_format;
		if (seed !== undefined) params.seed = String(seed);

		const data = await apiRequest("/v1/profiles", params);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
		};
	},
);

server.tool(
	"get_profile",
	"Get a single profile by UUID.",
	{
		uuid: z.string().describe("The profile UUID"),
	},
	async ({ uuid }) => {
		try {
			const data = await apiRequest(`/v1/profiles/${uuid}`);
			return {
				content: [
					{ type: "text" as const, text: JSON.stringify(data, null, 2) },
				],
			};
		} catch (e) {
			return {
				content: [
					{
						type: "text" as const,
						text: e instanceof Error ? e.message : "Profile not found",
					},
				],
				isError: true,
			};
		}
	},
);

server.tool(
	"get_random_image",
	"Get a random profile photo. Returns the image as JPEG. Each call consumes 1 image unit from your daily limit.",
	{
		size: z
			.enum(["64", "128", "256", "512", "1024"])
			.optional()
			.describe("Image size in pixels (default: 1024)"),
	},
	async ({ size }) => {
		if (!currentKey) {
			return {
				content: [{ type: "text" as const, text: noKeyError() }],
				isError: true,
			};
		}
		const params: Record<string, string> = {};
		if (size) params.size = size;

		const url = new URL("/v1/images/random", BASE_URL);
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}

		const res = await fetch(url.toString(), {
			headers: { "X-API-Key": currentKey },
		});

		if (!res.ok) {
			const body = await res.text();
			return {
				content: [
					{
						type: "text" as const,
						text: `Error ${res.status}: ${body}`,
					},
				],
				isError: true,
			};
		}

		const buffer = await res.arrayBuffer();
		const base64 = Buffer.from(buffer).toString("base64");
		return {
			content: [
				{
					type: "image" as const,
					data: base64,
					mimeType: "image/jpeg",
				},
			],
		};
	},
);

server.tool(
	"get_image",
	"Get a specific profile photo by UUID. Returns the image as JPEG. Each call consumes 1 image unit from your daily limit.",
	{
		uuid: z.string().describe("The photo UUID"),
		size: z
			.enum(["64", "128", "256", "512", "1024"])
			.optional()
			.describe("Image size in pixels (default: 1024)"),
	},
	async ({ uuid, size }) => {
		if (!currentKey) {
			return {
				content: [{ type: "text" as const, text: noKeyError() }],
				isError: true,
			};
		}
		const params: Record<string, string> = {};
		if (size) params.size = size;

		const url = new URL(`/v1/images/${uuid}`, BASE_URL);
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}

		const res = await fetch(url.toString(), {
			headers: { "X-API-Key": currentKey },
		});

		if (!res.ok) {
			const body = await res.text();
			return {
				content: [
					{
						type: "text" as const,
						text: `Error ${res.status}: ${body}`,
					},
				],
				isError: true,
			};
		}

		const buffer = await res.arrayBuffer();
		const base64 = Buffer.from(buffer).toString("base64");
		return {
			content: [
				{
					type: "image" as const,
					data: base64,
					mimeType: "image/jpeg",
				},
			],
		};
	},
);

server.tool(
	"get_companies",
	"Get random fake companies for testing and seed data. Returns realistic companies with 100+ fields including names, legal form, industry, leadership, financials, tech stack, locations, logos, and more across 9 countries.",
	{
		count: z
			.number()
			.min(1)
			.max(100)
			.default(10)
			.describe("Number of companies to return (1-100)"),
		industry: z
			.string()
			.optional()
			.describe(
				"Filter by industry (Technology, Healthcare, Finance, Education, Manufacturing, Retail, Media, Consulting, Real Estate, Transportation, Energy, Telecommunications, Hospitality, Agriculture, Legal, Construction)",
			),
		country: z
			.string()
			.optional()
			.describe(
				"Comma-separated country codes to include (US, GB, DE, FR, AU, BR, JP, IN, NG)",
			),
		size: z
			.string()
			.optional()
			.describe(
				"Comma-separated size brackets (1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5000+)",
			),
		fields: z
			.string()
			.optional()
			.describe(
				"Comma-separated field groups to return (name, industry, size, location, contact, social, financial, tech, leadership, legal, operations, product, relationships, meta). The `relationships` group returns employee_uuids — use with get_profile to hydrate the company's staff.",
			),
		logo_size: z
			.enum(["64", "128", "256", "512", "1024"])
			.optional()
			.describe("Logo size in meta.logo_url (default: 1024)"),
		logo_format: z
			.enum(["jpg", "webp"])
			.optional()
			.describe(
				"Image format for meta.logo_url (default: jpg, webp is ~30% smaller)",
			),
		seed: z
			.number()
			.optional()
			.describe(
				"Seed for deterministic results — same seed returns same companies",
			),
	},
	async ({
		count,
		industry,
		country,
		size,
		fields,
		logo_size,
		logo_format,
		seed,
	}) => {
		const params: Record<string, string> = {};
		if (count) params.count = String(count);
		if (industry) params.industry = industry;
		if (country) params.country = country;
		if (size) params.size = size;
		if (fields) params.fields = fields;
		if (logo_size) params.logo_size = logo_size;
		if (logo_format) params.logo_format = logo_format;
		if (seed !== undefined) params.seed = String(seed);

		const data = await apiRequest("/v1/companies", params);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
		};
	},
);

server.tool(
	"get_company",
	"Get a single company by UUID.",
	{
		uuid: z.string().describe("The company UUID"),
		logo_size: z
			.enum(["64", "128", "256", "512", "1024"])
			.optional()
			.describe("Logo size in meta.logo_url (default: 1024)"),
		logo_format: z
			.enum(["jpg", "webp"])
			.optional()
			.describe(
				"Image format for meta.logo_url (default: jpg, webp ~30% smaller)",
			),
	},
	async ({ uuid, logo_size, logo_format }) => {
		try {
			const params: Record<string, string> = {};
			if (logo_size) params.logo_size = logo_size;
			if (logo_format) params.logo_format = logo_format;
			const data = await apiRequest(`/v1/companies/${uuid}`, params);
			return {
				content: [
					{ type: "text" as const, text: JSON.stringify(data, null, 2) },
				],
			};
		} catch (e) {
			return {
				content: [
					{
						type: "text" as const,
						text: e instanceof Error ? e.message : "Company not found",
					},
				],
				isError: true,
			};
		}
	},
);

server.tool(
	"get_usage",
	"Check your API key usage, tier, and daily limits for profiles and images.",
	{},
	async () => {
		const data = await apiRequest("/v1/billing/usage");
		return {
			content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
		};
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
