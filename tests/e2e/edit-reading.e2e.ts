import { expect, test, type Page } from '@playwright/test';
import { seed, stored, type Seed } from './helpers';

// 25 October 2026, 09:58 in Brussels.
const NOW = new Date('2026-10-25T08:58:00Z');

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

const SEED: Seed[] = [
	{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86, note: 'na koffie' },
	{ at: '2026-10-24T21:15:00+02:00', systolic: 150, diastolic: 92 }
];

function rows(page: Page) {
	return page.getByRole('table', { name: 'Alle metingen' }).locator('tbody tr.reading');
}

async function openFirst(page: Page) {
	await rows(page).first().click();
	await expect(page).toHaveURL('/reading/seed-0');
	await expect(page.getByRole('heading', { name: 'Meting bewerken' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(NOW);
	await seed(page, SEED);
});

test('tapping a row opens the reading with its values filled in (C7)', async ({ page }) => {
	await openFirst(page);
	await expect(page.getByLabel('Bovendruk')).toHaveValue('138');
	await expect(page.getByLabel('Onderdruk')).toHaveValue('86');
	await expect(page.getByLabel('Notitie')).toHaveValue('na koffie');
	await expect(page.locator('#sys-cat')).toHaveText('Licht verhoogd');
	await expect(page.getByText('Vandaag, 25 okt · 07:42 · ochtend')).toBeVisible();
	// No keyboard pops up when editing.
	await expect(page.getByLabel('Bovendruk')).not.toBeFocused();
});

test('every row has a keyboard link with a full label', async ({ page }) => {
	const link = page.getByRole('link', { name: 'Meting van zo 25/10 07:42 bewerken' });
	await expect(link).toHaveAttribute('href', '/reading/seed-0');
	await link.focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL('/reading/seed-0');
});

test('saves changed values and keeps the time', async ({ page }) => {
	await openFirst(page);
	await page.getByLabel('Bovendruk').fill('');
	await page.getByLabel('Bovendruk').pressSequentially('142');
	await page.getByLabel('Notitie').fill('');
	await page.getByRole('button', { name: 'Links' }).click();
	await page.getByRole('button', { name: 'Opslaan' }).click();

	await expect(page).toHaveURL('/list');
	await expect(rows(page).first()).toHaveText(/zo 25\/10\s*07:42\s*142L/);
	const edited = (await stored(page)).find((r) => r.id === 'seed-0');
	expect(edited).toMatchObject({
		measuredAt: '2026-10-25T06:42:00.000Z',
		systolic: 142,
		diastolic: 86,
		arm: 'left',
		updatedAt: NOW.toISOString()
	});
	expect(edited).not.toHaveProperty('note');
});

test('changes the time; "Terugzetten" goes back to the stored time', async ({ page }) => {
	await openFirst(page);
	await page.getByRole('button', { name: /Wijzig/ }).click();
	await expect(page.getByLabel('Tijd', { exact: true })).toHaveValue('07:42');
	await page.getByLabel('Tijd', { exact: true }).fill('08:15');
	await expect(page.getByText('Vandaag, 25 okt · 08:15 · ochtend')).toBeVisible();
	await page.getByRole('button', { name: 'Terugzetten' }).click();
	await expect(page.getByText('Vandaag, 25 okt · 07:42 · ochtend')).toBeVisible();

	await page.getByRole('button', { name: /Wijzig/ }).click();
	await page.getByLabel('Tijd', { exact: true }).fill('08:15');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page).toHaveURL('/list');
	const edited = (await stored(page)).find((r) => r.id === 'seed-0');
	expect(edited).toMatchObject({ measuredAt: '2026-10-25T07:15:00.000Z' });
});

test('asks "Klopt dit?" for implausible edits too (C4)', async ({ page }) => {
	await openFirst(page);
	await page.getByLabel('Onderdruk').fill('');
	await page.getByLabel('Onderdruk').pressSequentially('140');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByText('Bovendruk niet hoger dan onderdruk')).toBeVisible();
});

test('Annuleren goes back to the list without saving', async ({ page }) => {
	await openFirst(page);
	await page.getByLabel('Bovendruk').fill('199');
	await page.getByRole('link', { name: 'Annuleren' }).click();
	await expect(page).toHaveURL('/list');
	expect((await stored(page)).find((r) => r.id === 'seed-0')).toMatchObject({ systolic: 138 });
});

test('deleting removes the reading and offers undo, which brings it back (C7)', async ({ page }) => {
	await openFirst(page);
	await page.getByRole('button', { name: 'Verwijderen' }).click();

	await expect(page).toHaveURL('/list');
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByRole('status')).toHaveText(/Meting verwijderd\s*Ongedaan maken \(10\)/);
	expect((await stored(page)).find((r) => r.id === 'seed-0')).toMatchObject({ deleted: true });

	await page.getByRole('button', { name: /Ongedaan maken/ }).click();
	await expect(page.getByRole('status')).toHaveText('Meting teruggezet');
	await expect(rows(page)).toHaveCount(2);
	await expect(rows(page).first()).toHaveText(/zo 25\/10\s*07:42\s*138L/);
	expect((await stored(page)).find((r) => r.id === 'seed-0')).toMatchObject({ deleted: false });
});

test('a deleted reading can no longer be opened', async ({ page }) => {
	await openFirst(page);
	await page.getByRole('button', { name: 'Verwijderen' }).click();
	await expect(page).toHaveURL('/list');
	await page.goto('/reading/seed-0');
	await expect(page.getByRole('heading', { name: 'Meting niet gevonden' })).toBeVisible();
});

test('shows "niet gevonden" for an unknown reading', async ({ page }) => {
	await page.goto('/reading/does-not-exist');
	await expect(page.getByRole('heading', { name: 'Meting niet gevonden' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Naar de lijst' })).toHaveAttribute('href', '/list');
});
