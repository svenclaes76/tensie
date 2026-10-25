import { expect, test, type Page } from '@playwright/test';
import { seed, type Seed } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

const SEED: Seed[] = [
	{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86 },
	{ at: '2026-10-24T21:15:00+02:00', systolic: 150, diastolic: 92, note: 'hoofdpijn' },
	{ at: '2026-10-24T07:40:00+02:00', systolic: 182, diastolic: 101 },
	{ at: '2026-10-23T13:10:00+02:00', systolic: 128, diastolic: 82 },
	{ at: '2026-10-22T08:00:00+02:00', systolic: 200, diastolic: 120, deleted: true },
	{ at: '2026-09-30T07:35:00+02:00', systolic: 120, diastolic: 80 }
];

function bodyRows(page: Page) {
	return page.getByRole('table', { name: 'Alle metingen' }).locator('tbody tr');
}

test('shows all readings newest first, grouped by month (H1)', async ({ page }) => {
	await seed(page, SEED);
	await expect(page.getByRole('heading', { name: 'Metingen', level: 1 })).toBeVisible();

	const rows = bodyRows(page);
	await expect(rows).toHaveText([
		/Oktober 2026\s*gem\. 150\/90 · 4×/,
		/^zo 25\/10\s*07:42\s*138L, licht verhoogd\s*86L, licht verhoogd$/,
		/^za 24\/10\s*21:15\s*150L, licht verhoogd\s*92L, licht verhoogd$/,
		/^\s*07:40\s*182E, ernstig verhoogd\s*101G, gemiddeld verhoogd$/,
		/^vr 23\/10\s*13:10\s*128, normaal\s*82, normaal$/,
		/September 2026\s*gem\. 120\/80 · 1×/,
		/wo 30\/09\s*07:35/
	]);
	// The deleted reading of 22 October is not shown.
	await expect(page.getByText('do 22/10')).toHaveCount(0);
});

test('tints each value by its category and marks notes', async ({ page }) => {
	await seed(page, SEED);
	const severe = page.locator('.value.severe');
	await expect(severe).toHaveCount(1);
	await expect(severe).toHaveCSS('background-color', 'rgb(159, 18, 57)');
	await expect(page.locator('.value.moderate')).toHaveCount(1);
	await expect(page.locator('.value.mild')).toHaveCount(4);
	await expect(page.getByRole('img', { name: 'Heeft notitie' })).toHaveCount(1);
});

test('filters on morning and evening, with the month average of what is shown', async ({ page }) => {
	await seed(page, SEED);
	const rows = bodyRows(page);

	await page.getByRole('button', { name: 'Ochtend' }).click();
	await expect(page.getByRole('button', { name: 'Ochtend' })).toHaveAttribute('aria-pressed', 'true');
	await expect(rows).toHaveText([
		/Oktober 2026\s*gem\. 160\/94 · 2×/,
		/zo 25\/10\s*07:42/,
		/za 24\/10\s*07:40/,
		/September 2026\s*gem\. 120\/80 · 1×/,
		/wo 30\/09\s*07:35/
	]);

	await page.getByRole('button', { name: 'Avond' }).click();
	await expect(rows).toHaveText([/Oktober 2026\s*gem\. 150\/92 · 1×/, /za 24\/10\s*21:15/]);

	await page.getByRole('button', { name: 'Alles' }).click();
	await expect(rows).toHaveCount(7);
});

test('keeps the column headers visible while scrolling', async ({ page }) => {
	const many: Seed[] = Array.from({ length: 60 }, (_, i) => ({
		at: new Date(Date.UTC(2026, 9, 1, 6, 30) + i * 12 * 3600_000).toISOString(),
		systolic: 130 + (i % 20),
		diastolic: 80 + (i % 10)
	}));
	await seed(page, many);
	const header = page.getByRole('columnheader', { name: 'Datum' });
	const top = (await header.boundingBox())!.y;
	await page.locator('main').evaluate((el) => el.scrollBy(0, 800));
	await expect(header).toBeInViewport();
	expect((await header.boundingBox())!.y).toBeCloseTo(top, 0);
});

test('shows an empty state with the ways to add readings', async ({ page }) => {
	await page.goto('/list');
	await expect(page.getByText('Nog geen metingen.')).toBeVisible();
	await expect(page.getByRole('main').getByRole('link', { name: 'Nieuwe meting' })).toHaveAttribute('href', '/new');
	await expect(page.getByRole('main').getByRole('link', { name: 'Importeren' })).toHaveAttribute('href', '/import');
});

test('a new reading appears at the top after saving', async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-25T08:58:00Z'));
	await seed(page, SEED);
	await page.goto('/new');
	await page.getByLabel('Bovendruk').pressSequentially('146');
	await page.getByLabel('Onderdruk').pressSequentially('88');
	await page.getByRole('button', { name: 'Opslaan' }).click();

	await expect(page).toHaveURL('/list');
	await expect(bodyRows(page).nth(1)).toHaveText(/zo 25\/10\s*09:58\s*146L/);
	await expect(bodyRows(page).first()).toHaveText(/gem\. 149\/90 · 5×/);
});

test('navigation marks Lijst as the current tab and links to import', async ({ page }) => {
	await page.goto('/list');
	const nav = page.getByRole('navigation', { name: 'Hoofdmenu' });
	await expect(nav.getByRole('link', { name: 'Lijst' })).toHaveAttribute('aria-current', 'page');
	await expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
	await page.getByRole('banner').getByRole('link', { name: 'Importeren' }).click();
	await expect(page).toHaveURL('/import');
});

test('aligns the value headers with their right-aligned numbers', async ({ page }) => {
	await seed(page, SEED);
	for (const name of ['Boven', 'Onder']) {
		await expect(page.getByRole('columnheader', { name })).toHaveCSS('text-align', 'right');
	}
});
