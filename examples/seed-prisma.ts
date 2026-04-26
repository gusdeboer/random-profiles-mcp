/**
 * Seed a Prisma + Postgres database with fake users and companies from
 * the Random Profiles API.
 *
 * Drops 1,000 users and 1,000 companies with their relationships
 * preserved (each user → company_id, each company → up to 30 employee
 * IDs). Idempotent — safe to re-run; uses upsert by UUID.
 *
 * Setup:
 *   1. npm install -D random-profiles-types prisma @prisma/client tsx
 *   2. npx prisma init  # creates prisma/schema.prisma
 *   3. Paste the schema below into prisma/schema.prisma
 *   4. Set DATABASE_URL in .env
 *   5. Set RANDOM_PROFILES_API_KEY in .env (get one at random-profiles.com)
 *   6. npx prisma migrate dev --name init
 *   7. npx tsx examples/seed-prisma.ts
 *
 * Suggested prisma/schema.prisma:
 *
 *   model Company {
 *     id        String   @id          // UUID from Random Profiles
 *     name      String
 *     industry  String
 *     country   String
 *     size      String
 *     logoUrl   String?
 *     users     User[]
 *     createdAt DateTime @default(now())
 *   }
 *
 *   model User {
 *     id          String   @id        // UUID from Random Profiles
 *     firstName   String
 *     lastName    String
 *     email       String   @unique
 *     phone       String?
 *     country     String
 *     jobTitle    String?
 *     companyId   String?
 *     company     Company? @relation(fields: [companyId], references: [id])
 *     latitude    Float?
 *     longitude   Float?
 *     createdAt   DateTime @default(now())
 *   }
 */

import { PrismaClient } from "@prisma/client";
import type {
	Company,
	CompaniesResponse,
	Profile,
	ProfilesResponse,
} from "random-profiles-types";

const API = "https://random-profiles.com";
const KEY = process.env.RANDOM_PROFILES_API_KEY;
if (!KEY) throw new Error("Set RANDOM_PROFILES_API_KEY in your environment");

const prisma = new PrismaClient();

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
	// The free tier's per-request cap is 100. Page through 10 calls.
	const companies: Company[] = [];
	for (let offset = 0; offset < 10; offset++) {
		const page = await fetchPage<CompaniesResponse>(
			`/v1/companies?count=100&seed=${offset}&fields=name,industry,size,location,meta`,
		);
		companies.push(...page.companies);
	}
	console.log(`  got ${companies.length} companies`);

	console.log("Fetching 1,000 profiles…");
	const profiles: Profile[] = [];
	for (let offset = 0; offset < 10; offset++) {
		const page = await fetchPage<ProfilesResponse>(
			`/v1/profiles?count=100&seed=${offset}&fields=name,email,phone,address,job,relationships`,
		);
		profiles.push(...page.profiles);
	}
	console.log(`  got ${profiles.length} profiles`);

	console.log("Upserting companies…");
	for (const c of companies) {
		await prisma.company.upsert({
			where: { id: c.uuid },
			update: {},
			create: {
				id: c.uuid,
				name: c.name.legal,
				industry: c.industry.category,
				country: c.location.country,
				size: c.size.category,
				logoUrl: c.meta.logo_url,
			},
		});
	}

	console.log("Upserting profiles…");
	const knownCompanyIds = new Set(companies.map((c) => c.uuid));
	for (const p of profiles) {
		// Only link to a company we actually inserted (the API may return
		// a company UUID that didn't show up in our 1,000-company sample).
		const companyId =
			p.relationships?.company_uuid &&
			knownCompanyIds.has(p.relationships.company_uuid)
				? p.relationships.company_uuid
				: null;

		await prisma.user.upsert({
			where: { id: p.uuid },
			update: {},
			create: {
				id: p.uuid,
				firstName: p.name.first,
				lastName: p.name.last,
				email: p.email.primary,
				phone: p.phone.mobile,
				country: p.address.country,
				jobTitle: p.job.title,
				companyId,
				latitude: p.address.latitude,
				longitude: p.address.longitude,
			},
		});
	}

	const userCount = await prisma.user.count();
	const companyCount = await prisma.company.count();
	console.log(`Done. ${userCount} users, ${companyCount} companies in DB.`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
