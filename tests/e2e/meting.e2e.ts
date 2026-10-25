import { expect, test, type Page } from '@playwright/test';

// 25 October 2026, 09:58 in Brussels (CET, the morning the clocks went back).
const NOW = new Date('2026-10-25T08:58:00Z');

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(NOW);
	await page.goto('/meting');
});

/** Readings as stored in IndexedDB. */
async function stored(page: Page): Promise<Record<string, unknown>[]> {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('tensie');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('readings').objectStore('readings').getAll();
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				};
			})
	);
}

test('saves a reading with the numbers and one tap (C1, C2, H4)', async ({ page }) => {
	const systolic = page.getByLabel('Bovendruk');
	const diastolic = page.getByLabel('Onderdruk');
	await expect(systolic).toBeFocused();
	await expect(page.locator('#sys-cat')).toHaveText('–');

	await systolic.pressSequentially('146');
	// Three digits move focus on by themselves.
	await expect(diastolic).toBeFocused();
	await expect(page.locator('#sys-cat')).toHaveText('Licht verhoogd');
	await diastolic.pressSequentially('88');
	await expect(page.locator('#dia-cat')).toHaveText('Licht verhoogd');

	await expect(page.getByText('Vandaag, 25 okt · 09:58 · ochtend')).toBeVisible();

	await page.getByRole('button', { name: 'Links' }).click();
	await expect(page.getByRole('button', { name: 'Links' })).toHaveAttribute('aria-pressed', 'true');
	await page.getByLabel('Notitie').fill('na koffie');

	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page).toHaveURL('/');

	expect(await stored(page)).toEqual([
		expect.objectContaining({
			measuredAt: '2026-10-25T08:58:00.000Z',
			timeZone: 'Europe/Brussels',
			systolic: 146,
			diastolic: 88,
			arm: 'links',
			note: 'na koffie',
			source: 'manual',
			deleted: false
		})
	]);
});

test('Enter moves from bovendruk to onderdruk and saves from there', async ({ page }) => {
	await page.getByLabel('Bovendruk').pressSequentially('95');
	await page.keyboard.press('Enter');
	await expect(page.getByLabel('Onderdruk')).toBeFocused();
	await page.getByLabel('Onderdruk').pressSequentially('60');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL('/');
	expect(await stored(page)).toEqual([expect.objectContaining({ systolic: 95, diastolic: 60 })]);
});

test('keeps only digits, at most three', async ({ page }) => {
	await page.getByLabel('Bovendruk').pressSequentially('1a4');
	await expect(page.getByLabel('Bovendruk')).toHaveValue('14');
	await page.getByLabel('Onderdruk').fill('8812');
	await expect(page.getByLabel('Onderdruk')).toHaveValue('881');
});

test('asks for both values before saving', async ({ page }) => {
	await page.getByLabel('Bovendruk').pressSequentially('146');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByRole('alert')).toHaveText('Vul je bovendruk en onderdruk in.');
	await expect(page.getByLabel('Onderdruk')).toBeFocused();
	expect(await stored(page)).toEqual([]);
});

test('asks for confirmation for implausible values instead of blocking (C4)', async ({ page }) => {
	await page.getByLabel('Bovendruk').pressSequentially('300');
	await page.getByLabel('Onderdruk').pressSequentially('88');
	await page.getByRole('button', { name: 'Opslaan' }).click();

	const heading = page.getByRole('heading', { name: 'Klopt dit?' });
	await expect(heading).toBeFocused();
	await expect(page.getByText('Bovendruk buiten 60–260')).toBeVisible();

	await page.getByRole('button', { name: 'Aanpassen' }).click();
	await expect(page.getByLabel('Bovendruk')).toBeFocused();
	expect(await stored(page)).toEqual([]);

	await page.getByRole('button', { name: 'Opslaan' }).click();
	await page.getByRole('button', { name: 'Toch opslaan' }).click();
	await expect(page).toHaveURL('/');
	expect(await stored(page)).toEqual([expect.objectContaining({ systolic: 300, diastolic: 88 })]);
});

test('flags systolic not above diastolic', async ({ page }) => {
	await page.getByLabel('Bovendruk').pressSequentially('85');
	await page.getByLabel('Onderdruk').pressSequentially('90');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByText('Bovendruk niet hoger dan onderdruk')).toBeVisible();
});

test('shows the fixed doctor/112 line for an ernstig verhoogd value', async ({ page }) => {
	await expect(page.getByText(/bel 112/)).toHaveCount(0);
	await page.getByLabel('Bovendruk').pressSequentially('185');
	await expect(page.locator('#sys-cat')).toHaveText('Ernstig verhoogd');
	await expect(page.getByText(/neem contact op met je arts of bel 112/)).toBeVisible();
});

test('a picked time is saved in the device time zone and gets its day part (C1, T5)', async ({
	page
}) => {
	await page.getByRole('button', { name: /Wijzig/ }).click();
	await page.getByLabel('Datum', { exact: true }).fill('2026-10-24');
	await page.getByLabel('Tijd', { exact: true }).fill('21:30');
	await expect(page.getByText('Gisteren, 24 okt · 21:30 · avond')).toBeVisible();

	await page.getByLabel('Bovendruk').pressSequentially('140');
	await page.getByLabel('Onderdruk').pressSequentially('85');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page).toHaveURL('/');
	// 21:30 on 24 October was still summer time (UTC+2).
	expect(await stored(page)).toEqual([
		expect.objectContaining({ measuredAt: '2026-10-24T19:30:00.000Z' })
	]);
});

test('"Nu" goes back to the current time', async ({ page }) => {
	await page.getByRole('button', { name: /Wijzig/ }).click();
	await page.getByLabel('Tijd', { exact: true }).fill('14:00');
	await expect(page.getByText('Vandaag, 25 okt · 14:00')).toBeVisible();
	await page.getByRole('button', { name: 'Nu' }).click();
	await expect(page.getByText('Vandaag, 25 okt · 09:58 · ochtend')).toBeVisible();
});

test('asks for confirmation for a time in the future', async ({ page }) => {
	await page.getByRole('button', { name: /Wijzig/ }).click();
	await page.getByLabel('Tijd', { exact: true }).fill('23:00');
	await page.getByLabel('Bovendruk').pressSequentially('140');
	await page.getByLabel('Onderdruk').pressSequentially('85');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByText('Tijdstip ligt in de toekomst')).toBeVisible();
	expect(await stored(page)).toEqual([]);
});

test('Annuleren goes back without saving', async ({ page }) => {
	await page.getByLabel('Bovendruk').pressSequentially('146');
	await page.getByRole('link', { name: 'Annuleren' }).click();
	await expect(page).toHaveURL('/');
	expect(await stored(page)).toEqual([]);
});
