import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seed } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

/** Collects every CSP violation and CSP console error on the page. */
async function watchCsp(page: Page) {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (/Content Security Policy/i.test(message.text())) problems.push(message.text());
	});
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (event) => {
			console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
		});
	});
	return problems;
}

function expectStrict(csp: string | null | undefined) {
	expect(csp).toContain("default-src 'self'");
	expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
	expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
	expect(csp).toContain("object-src 'none'");
	// No Supabase project in the test build, so nowhere to send data but the site itself.
	expect(csp).toContain("connect-src 'self';");
}

test('the built page carries a strict, hash-based policy for static hosting', async () => {
	// Cloudflare Pages serves build/index.html as a file: the policy is its <meta> tag.
	const html = readFileSync(resolve('build/index.html'), 'utf8');
	expectStrict(/<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)?.[1]);
});

test('the preview server sends the same policy as a header', async ({ page }) => {
	const response = await page.goto('/');
	expectStrict(response?.headers()['content-security-policy']);
});

test('nothing the app does is blocked by the policy', async ({ page }) => {
	const problems = await watchCsp(page);
	await page.clock.setFixedTime(new Date('2025-10-11T10:00:00Z'));

	// Import (SheetJS loads lazily), then every screen, the chart tooltip and the downloads.
	await page.goto('/import');
	await page.locator('input[type="file"]').setInputFiles(resolve('tests/fixtures/sample-import.xlsx'));
	await page.getByRole('button', { name: /importeren$/ }).click();
	await page.getByRole('heading', { name: /geïmporteerd/ }).waitFor();
	for (const url of ['/', '/list', '/monthly', '/settings', '/new']) {
		await page.goto(url);
		await page.waitForLoadState('networkidle');
	}
	await page.goto('/chart');
	await page.getByRole('button', { name: '90 d' }).click();
	const dot = page.locator('circle.dot').first();
	const box = (await dot.boundingBox())!;
	await page.mouse.move(box.x + 4, box.y + 30);
	await expect(page.locator('.tooltip')).toBeVisible();

	await page.goto('/export');
	await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel (.xlsx)' }).click()]);
	await page.goto('/report?from=2025-07-01&to=2025-10-11');
	await page.locator('figure svg').first().waitFor();

	expect(problems).toEqual([]);
});

test('seeded data and the service worker work under the policy', async ({ page }) => {
	const problems = await watchCsp(page);
	await seed(page, [{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86 }]);
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	expect(problems).toEqual([]);
});
