/**
 * Playwright test fixture: hand each test a deterministic fake user
 * and matching company from the Random Profiles API.
 *
 * The fixture caches one HTTP call per worker (so 1,000 tests don't hit
 * the API 1,000 times) and uses ?seed= for reproducibility — the same
 * test always gets the same person, which makes failures replayable.
 *
 * Setup:
 *   1. npm install -D random-profiles-types @playwright/test
 *   2. Set RANDOM_PROFILES_API_KEY in your CI / .env
 *   3. Replace your `import { test } from '@playwright/test'`
 *      with `import { test } from './examples/playwright-fixture'`
 *
 * Then in any test:
 *
 *   test('signup form accepts a real-looking person', async ({ page, fakeUser }) => {
 *     await page.goto('/signup');
 *     await page.getByLabel('First name').fill(fakeUser.name.first);
 *     await page.getByLabel('Email').fill(fakeUser.email.primary);
 *     await page.getByLabel('Phone').fill(fakeUser.phone.mobile);
 *     await page.getByRole('button', { name: 'Sign up' }).click();
 *     await expect(page.getByText('Welcome')).toBeVisible();
 *   });
 *
 *   test('company onboarding renders a logo', async ({ page, fakeCompany }) => {
 *     await page.goto(`/onboard?company=${fakeCompany.uuid}`);
 *     await expect(page.locator('img[alt="company logo"]')).toHaveAttribute(
 *       'src',
 *       fakeCompany.meta.logo_url,
 *     );
 *   });
 */

import { test as base } from "@playwright/test";
import type {
	CompaniesResponse,
	Company,
	Profile,
	ProfilesResponse,
} from "random-profiles-types";

type Fixtures = {
	fakeUser: Profile;
	fakeCompany: Company;
};

const API = "https://random-profiles.com";
const KEY = process.env.RANDOM_PROFILES_API_KEY;

async function fetchOne<T>(path: string): Promise<T> {
	if (!KEY) {
		throw new Error(
			"RANDOM_PROFILES_API_KEY not set — get a free key at random-profiles.com",
		);
	}
	const res = await fetch(`${API}${path}`, {
		headers: { "X-API-Key": KEY },
	});
	if (!res.ok) {
		throw new Error(`${path} → ${res.status} ${await res.text()}`);
	}
	return res.json() as Promise<T>;
}

// Per-worker cache so we don't hammer the API. Each Playwright worker
// gets its own scope, so tests within a worker share data but workers
// don't.
let cachedUser: Profile | null = null;
let cachedCompany: Company | null = null;

export const test = base.extend<Fixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture API requires the first arg to be a destructured object (even if empty) to skip dependency injection.
	fakeUser: async ({}, use, testInfo) => {
		if (!cachedUser) {
			// Use the test title hashed to a small seed so the same test
			// always gets the same user across CI runs. This makes failure
			// reproductions trivial: paste the seed into the URL and you'll
			// see the exact same person.
			const seed = hashToSeed(testInfo.titlePath.join(" "));
			const data = await fetchOne<ProfilesResponse>(
				`/v1/profiles?count=1&seed=${seed}&fields=name,email,phone,address,job,relationships`,
			);
			cachedUser = data.profiles[0];
		}
		await use(cachedUser);
	},

	// biome-ignore lint/correctness/noEmptyPattern: see fakeUser fixture comment.
	fakeCompany: async ({}, use, testInfo) => {
		if (!cachedCompany) {
			const seed = hashToSeed(testInfo.titlePath.join(" "));
			const data = await fetchOne<CompaniesResponse>(
				`/v1/companies?count=1&seed=${seed}&fields=name,industry,size,location,meta`,
			);
			cachedCompany = data.companies[0];
		}
		await use(cachedCompany);
	},
});

function hashToSeed(s: string): number {
	// Tiny FNV-1a — good enough for a stable test seed.
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	// Faker accepts unsigned ints; clamp to 31 bits.
	return Math.abs(h | 0);
}

export { expect } from "@playwright/test";
