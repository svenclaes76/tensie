import { expect, test, type Page } from '@playwright/test';
import { seed } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

function limit(page: Page, category: string, measure: 'bovendruk' | 'onderdruk') {
	return page.getByRole('textbox', { name: `${category}, ${measure} vanaf` });
}

async function storedSettings(page: Page): Promise<Record<string, unknown>[]> {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('tensie');
				open.onsuccess = () => {
					const request = open.result.transaction('settings').objectStore('settings').getAll();
					request.onsuccess = () => {
						open.result.close();
						resolve(request.result);
					};
					request.onerror = () => reject(request.error);
				};
			})
	);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/settings');
	await expect(limit(page, 'Licht verhoogd', 'bovendruk')).toBeEnabled();
});

test('shows the default thresholds and day parts (T3, T5)', async ({ page }) => {
	await expect(page.getByRole('heading', { name: 'Instellingen', level: 1 })).toBeVisible();
	const values = [
		['Licht verhoogd', '135', '85'],
		['Gemiddeld verhoogd', '160', '100'],
		['Ernstig verhoogd', '180', '110']
	] as const;
	for (const [category, systolic, diastolic] of values) {
		await expect(limit(page, category, 'bovendruk')).toHaveValue(systolic);
		await expect(limit(page, category, 'onderdruk')).toHaveValue(diastolic);
	}
	await expect(page.locator('.fixed')).toHaveText(['< 135', '< 85']);
	await expect(page.getByLabel('Ochtend, van')).toHaveValue('04:00');
	await expect(page.getByLabel('Ochtend, tot en met')).toHaveValue('11:59');
	await expect(page.getByRole('link', { name: 'Terug' })).toHaveAttribute('href', '/');
});

test('saves a valid change when the field is left, and keeps it (T1)', async ({ page }) => {
	await limit(page, 'Licht verhoogd', 'bovendruk').fill('130');
	await expect(page.locator('.fixed').first()).toHaveText('< 130');
	await limit(page, 'Licht verhoogd', 'bovendruk').blur();
	await expect(page.getByRole('status')).toHaveText('Opgeslagen');

	expect(await storedSettings(page)).toEqual([
		expect.objectContaining({
			id: 'settings',
			thresholds: {
				systolic: { mild: 130, moderate: 160, severe: 180 },
				diastolic: { mild: 85, moderate: 100, severe: 110 }
			}
		})
	]);
	await page.reload();
	await expect(limit(page, 'Licht verhoogd', 'bovendruk')).toHaveValue('130');
});

test('refuses limits that do not rise, and saves nothing (T2)', async ({ page }) => {
	await limit(page, 'Gemiddeld verhoogd', 'bovendruk').fill('120');
	await limit(page, 'Gemiddeld verhoogd', 'bovendruk').blur();
	await expect(page.getByRole('alert')).toHaveText('De grenzen moeten van boven naar onder telkens stijgen.');
	await expect(limit(page, 'Licht verhoogd', 'bovendruk')).toHaveAttribute('aria-invalid', 'true');
	await expect(limit(page, 'Gemiddeld verhoogd', 'bovendruk')).toHaveAttribute('aria-invalid', 'true');
	await expect(limit(page, 'Ernstig verhoogd', 'bovendruk')).toHaveAttribute('aria-invalid', 'false');
	expect(await storedSettings(page)).toEqual([]);

	await page.reload();
	await expect(limit(page, 'Gemiddeld verhoogd', 'bovendruk')).toHaveValue('160');
});

test('refuses implausible or empty limits', async ({ page }) => {
	await limit(page, 'Licht verhoogd', 'onderdruk').fill('20');
	await expect(page.getByRole('alert')).toHaveText(
		'Vul hele getallen in: bovendruk 60–260, onderdruk 30–160.'
	);
	await limit(page, 'Licht verhoogd', 'onderdruk').fill('');
	await limit(page, 'Licht verhoogd', 'onderdruk').blur();
	await expect(page.getByRole('alert')).toBeVisible();
	expect(await storedSettings(page)).toEqual([]);
});

test('keeps only digits in the limit fields', async ({ page }) => {
	await limit(page, 'Ernstig verhoogd', 'bovendruk').fill('18a5x');
	await expect(limit(page, 'Ernstig verhoogd', 'bovendruk')).toHaveValue('185');
});

test('"Standaardwaarden herstellen" puts back and saves the defaults', async ({ page }) => {
	await limit(page, 'Ernstig verhoogd', 'onderdruk').fill('115');
	await limit(page, 'Ernstig verhoogd', 'onderdruk').blur();
	await expect(page.getByRole('status')).toHaveText('Opgeslagen');
	await page.getByRole('button', { name: 'Standaardwaarden herstellen' }).click();
	await expect(limit(page, 'Ernstig verhoogd', 'onderdruk')).toHaveValue('110');
	await expect.poll(async () => (await storedSettings(page))[0]?.thresholds).toEqual({
		systolic: { mild: 135, moderate: 160, severe: 180 },
		diastolic: { mild: 85, moderate: 100, severe: 110 }
	});
});

test('saves day parts, refusing overlaps (T5)', async ({ page }) => {
	await page.getByLabel('Ochtend, van').fill('05:00');
	await page.getByLabel('Ochtend, van').blur();
	await expect(page.getByRole('status')).toHaveText('Opgeslagen');
	await expect.poll(async () => (await storedSettings(page))[0]?.dayPartWindows).toEqual({
		morning: { start: '05:00', end: '11:59' },
		evening: { start: '18:00', end: '23:59' }
	});

	await page.getByLabel('Avond, van').fill('11:00');
	await page.getByLabel('Avond, van').blur();
	await expect(page.getByRole('alert')).toHaveText('Ochtend en avond mogen elkaar niet overlappen.');
	expect((await storedSettings(page))[0]?.dayPartWindows).toMatchObject({
		evening: { start: '18:00', end: '23:59' }
	});
});

test('a changed threshold reclassifies past readings everywhere (T4)', async ({ page }) => {
	await seed(page, [{ at: '2026-10-25T07:42:00+01:00', systolic: 132, diastolic: 82 }]);
	const row = page.locator('tbody tr.reading').first();
	await expect(row).toHaveText(/132, normaal/);

	await page.goto('/settings');
	await expect(limit(page, 'Licht verhoogd', 'bovendruk')).toBeEnabled();
	await limit(page, 'Licht verhoogd', 'bovendruk').fill('130');
	await limit(page, 'Licht verhoogd', 'bovendruk').blur();
	await expect(page.getByRole('status')).toHaveText('Opgeslagen');

	await page.goto('/list');
	await expect(row).toHaveText(/132L, licht verhoogd/);
	await page.goto('/monthly');
	await expect(page.locator('.badge').first()).toHaveText(/Licht verhoogd/);
});
