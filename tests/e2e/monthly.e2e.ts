import { expect, test, type Page } from '@playwright/test';
import { seed, type Seed } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

const NOW = new Date('2026-10-25T08:58:00Z');

/** Six September readings: mornings 140/90, evenings 150/94. */
const SEPTEMBER: Seed[] = Array.from({ length: 6 }, (_, i) => {
	const day = String(Math.floor(i / 2) + 1).padStart(2, '0');
	return i % 2 === 0
		? { at: `2026-09-${day}T07:30:00+02:00`, systolic: 140, diastolic: 90 }
		: { at: `2026-09-${day}T21:00:00+02:00`, systolic: 150, diastolic: 94 };
});

const SEED: Seed[] = [
	{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86 },
	{ at: '2026-10-22T21:00:00+02:00', systolic: 182, diastolic: 104 },
	...SEPTEMBER,
	{ at: '2026-09-20T14:00:00+02:00', systolic: 120, diastolic: 78 },
	{ at: '2026-09-21T08:00:00+02:00', systolic: 300, diastolic: 200, deleted: true }
];

function month(page: Page, name: RegExp) {
	return page.getByRole('region', { name });
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(NOW);
	await seed(page, SEED);
	await page.goto('/monthly');
});

test('one card per month, newest first, the current one running (H3)', async ({ page }) => {
	await expect(page.getByRole('heading', { name: 'Per maand', level: 1 })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Oktober 2026 (lopend)', 'September 2026']);
	const nav = page.getByRole('navigation', { name: 'Hoofdmenu' });
	await expect(nav.getByRole('link')).toHaveText(['Home', 'Lijst', 'Grafiek', 'Maand']);
	await expect(nav.getByRole('link', { name: 'Maand' })).toHaveAttribute('aria-current', 'page');
});

test('shows average, count and a category per value', async ({ page }) => {
	const september = month(page, /September 2026/);
	// 6 × morning/evening plus the 14:00 reading; the deleted one does not count.
	await expect(september).toContainText('7 metingen');
	await expect(september.locator('.value')).toHaveText('141 / 90');
	const badges = september.locator('.badge');
	// Shown as "B · Licht verhoogd"; a screen reader hears "Bovendruk: Licht verhoogd".
	await expect(badges).toHaveText(['B · Bovendruk: Licht verhoogd', 'O · Onderdruk: Licht verhoogd']);
	await expect(badges.first().locator('[aria-hidden="true"]')).toHaveText('B ·');
	await expect(badges.first().locator('.visually-hidden')).toHaveText('Bovendruk:');
});

test('splits morning and evening averages', async ({ page }) => {
	const september = month(page, /September 2026/);
	await expect(september.locator('.parts')).toHaveText(/Ochtend\s*140 \/ 90 \(3×\)\s*Avond\s*150 \/ 94 \(3×\)/);
	const october = month(page, /Oktober 2026/);
	await expect(october.locator('.parts')).toHaveText(/Ochtend\s*138 \/ 86 \(1×\)\s*Avond\s*182 \/ 104 \(1×\)/);
});

test('marks months with fewer than 6 readings as limited data (T6)', async ({ page }) => {
	await expect(month(page, /Oktober 2026/)).toContainText('Beperkte gegevens (minder dan 6 metingen)');
	await expect(month(page, /September 2026/)).not.toContainText('Beperkte gegevens');
});

test('a severe average gets the severe badge', async ({ page }) => {
	// October: (138 + 182) / 2 = 160 → gemiddeld; (86 + 104) / 2 = 95 → licht.
	const badges = month(page, /Oktober 2026/).locator('.badge');
	await expect(badges.first()).toHaveClass(/moderate/);
	await expect(badges.nth(1)).toHaveClass(/mild/);
});

test('shows an empty state without readings', async ({ page }) => {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				const open = indexedDB.open('tensie');
				open.onsuccess = () => {
					const tx = open.result.transaction('readings', 'readwrite');
					tx.objectStore('readings').clear();
					tx.oncomplete = () => {
						open.result.close();
						resolve();
					};
				};
			})
	);
	await page.reload();
	await expect(page.getByText('Nog geen metingen.')).toBeVisible();
});
