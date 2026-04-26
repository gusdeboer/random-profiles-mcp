/**
 * Seed a Supabase Postgres database with fake users and companies from
 * the Random Profiles API.
 *
 * Drops 1,000 users + 1,000 companies with foreign keys preserved.
 * Idempotent — uses upsert on the UUID primary key, so re-running is safe.
 *
 * Setup:
 *   1. Create a Supabase project at supabase.com (free tier is fine)
 *   2. npm install -D random-profiles-types @supabase/supabase-js tsx
 *   3. Paste the SQL schema below into the Supabase SQL editor
 *   4. .env:
 *        SUPABASE_URL="https://<project>.supabase.co"
 *        SUPABASE_SERVICE_KEY="ey…"          # service-role key, NOT anon
 *        RANDOM_PROFILES_API_KEY="rp_…"      # from random-profiles.com
 *   5. npx tsx examples/seed-supabase.ts
 *
 * Suggested SQL schema (run once in the Supabase SQL editor):
 *
 *   create table public.companies (
 *     id         uuid primary key,
 *     name       text not null,
 *     industry   text not null,
 *     country    text not null,
 *     size       text not null,
 *     logo_url   text,
 *     created_at timestamptz default now()
 *   );
 *
 *   create table public.users (
 *     id         uuid primary key,
 *     first_name text not null,
 *     last_name  text not null,
 *     email      text unique not null,
 *     phone      text,
 *     country    text not null,
 *     job_title  text,
 *     company_id uuid references public.companies(id) on delete set null,
 *     latitude   double precision,
 *     longitude  double precision,
 *     created_at timestamptz default now()
 *   );
 *
 *   -- RLS off for the seed; turn it on in production
 *   alter table public.users    disable row level security;
 *   alter table public.companies disable row level security;
 */

import { createClient } from "@supabase/supabase-js";
import type {
	CompaniesResponse,
	Company,
	Profile,
	ProfilesResponse,
} from "random-profiles-types";

const API = "https://random-profiles.com";
const KEY = process.env.RANDOM_PROFILES_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) throw new Error("Set RANDOM_PROFILES_API_KEY in your environment");
if (!SUPABASE_URL || !SUPABASE_KEY) {
	throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
	auth: { persistSession: false },
});

async function fetchPage<T>(path: string): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		headers: { "X-API-Key": KEY as string },
	});
	if (!res.ok) {
		throw new Error(`${path} → ${res.status} ${await res.text()}`);
	}
	return res.json() as Promise<T>;
}

async function main() {
	console.log("Fetching 1,000 companies…");
	const companies: Company[] = [];
	for (let offset = 0; offset < 10; offset++) {
		const page = await fetchPage<CompaniesResponse>(
			`/v1/companies?count=100&seed=${offset}&fields=name,industry,size,location,meta`,
		);
		companies.push(...page.companies);
	}

	console.log("Fetching 1,000 profiles…");
	const profiles: Profile[] = [];
	for (let offset = 0; offset < 10; offset++) {
		const page = await fetchPage<ProfilesResponse>(
			`/v1/profiles?count=100&seed=${offset}&fields=name,email,phone,address,job,relationships`,
		);
		profiles.push(...page.profiles);
	}

	console.log("Upserting companies in batches of 100…");
	for (let i = 0; i < companies.length; i += 100) {
		const batch = companies.slice(i, i + 100).map((c) => ({
			id: c.uuid,
			name: c.name.legal,
			industry: c.industry.category,
			country: c.location.country,
			size: c.size.category,
			logo_url: c.meta.logo_url,
		}));
		const { error } = await supabase
			.from("companies")
			.upsert(batch, { onConflict: "id" });
		if (error) throw error;
	}

	console.log("Upserting users in batches of 100…");
	const knownCompanyIds = new Set(companies.map((c) => c.uuid));
	for (let i = 0; i < profiles.length; i += 100) {
		const batch = profiles.slice(i, i + 100).map((p) => ({
			id: p.uuid,
			first_name: p.name.first,
			last_name: p.name.last,
			email: p.email.primary,
			phone: p.phone.mobile,
			country: p.address.country,
			job_title: p.job.title,
			company_id:
				p.relationships?.company_uuid &&
				knownCompanyIds.has(p.relationships.company_uuid)
					? p.relationships.company_uuid
					: null,
			latitude: p.address.latitude,
			longitude: p.address.longitude,
		}));
		const { error } = await supabase
			.from("users")
			.upsert(batch, { onConflict: "id" });
		if (error) throw error;
	}

	const { count: userCount } = await supabase
		.from("users")
		.select("*", { count: "exact", head: true });
	const { count: companyCount } = await supabase
		.from("companies")
		.select("*", { count: "exact", head: true });
	console.log(`Done. ${userCount} users, ${companyCount} companies in DB.`);
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
