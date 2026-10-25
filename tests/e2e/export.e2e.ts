import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { read, utils } from 'xlsx';
import { seed, type Seed } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

const NOW = new Date('2026-10-25T08:58:00Z');

const SEED: Seed[] = [
	{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86 },
	{ at: '2026-10-22T21:00:00+02:00', systolic: 182, diastolic: 104, note: 'hoofdpijn; moe' },
	{ at: '2026-09-02T07:30:00+02:00', systolic: 128, diastolic: 80 },
	{ at: '2026-09-03T07:30:00+02:00', systolic: 300, diastolic: 200, deleted: true }
];

async function downloaded(page: Page, button: string) {
	const [file] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: button }).click()
	]);
	return { name: file.suggestedFilename(), data: await readFile((await file.path())!) };
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(NOW);
	await seed(page, SEED);
	await page.goto('/export');
	await expect(page.getByText('Je hebt 3 metingen opgeslagen.')).toBeVisible();
});

test('is reached from Instellingen', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('link', { name: 'Exporteren en rapport' }).click();
	await expect(page).toHaveURL('/export');
	await expect(page.getByRole('link', { name: 'Terug' })).toHaveAttribute('href', '/settings');
});

test('downloads an Excel file in the import layout (E2)', async ({ page }) => {
	const { name, data } = await downloaded(page, 'Download Excel (.xlsx)');
	expect(name).toBe('tensie-metingen-2026-10-25.xlsx');
	const workbook = read(data);
	expect(workbook.SheetNames).toEqual(['Metingen']);
	const rows = utils.sheet_to_json<unknown[]>(workbook.Sheets.Metingen, { header: 1, raw: false });
	expect(rows).toEqual([
		['Datum', 'Uur', 'Boven', 'Onder', 'Notitie', 'Arm'],
		['02/09/2026', '07:30', '128', '80'],
		['22/10/2026', '21:00', '182', '104', 'hoofdpijn; moe'],
		['25/10/2026', '07:42', '138', '86']
	]);
	await expect(page.getByRole('status')).toHaveText('Je download is klaar.');
});

test('downloads a Belgian CSV (E2)', async ({ page }) => {
	const { name, data } = await downloaded(page, 'Download CSV');
	expect(name).toBe('tensie-metingen-2026-10-25.csv');
	expect(data.toString('utf8')).toBe(
		'﻿Datum;Uur;Boven;Onder;Notitie;Arm\r\n' +
			'02/09/2026;07:30;128;80;;\r\n' +
			'22/10/2026;21:00;182;104;"hoofdpijn; moe";\r\n' +
			'25/10/2026;07:42;138;86;;\r\n'
	);
});

test('downloads everything as JSON, deleted readings included (E3)', async ({ page }) => {
	const { name, data } = await downloaded(page, 'Download alles (.json)');
	expect(name).toBe('tensie-gegevens-2026-10-25.json');
	const json = JSON.parse(data.toString('utf8'));
	expect(json).toMatchObject({ app: 'Tensie', format: 1, exportedAt: NOW.toISOString() });
	expect(json.readings).toHaveLength(4);
	expect(json.readings.filter((r: { deleted: boolean }) => r.deleted)).toHaveLength(1);
	expect(json.settings).toEqual([]);
	expect(json.imports).toEqual([]);
});

test('saves name and birth year and builds the report for the period (E1)', async ({ page }) => {
	await page.getByLabel('Naam').fill('Sven Claes');
	await page.getByLabel('Geboortejaar').fill('19x76');
	await expect(page.getByLabel('Geboortejaar')).toHaveValue('1976');
	await page.getByRole('button', { name: '30 d' }).click();
	await page.getByRole('button', { name: 'Rapport maken' }).click();

	await expect(page).toHaveURL('/report?from=2026-09-26&to=2026-10-25');
	await expect(page.getByRole('heading', { name: 'Bloeddrukrapport', level: 1 })).toBeVisible();
	const facts = page.locator('.facts');
	await expect(facts).toContainText('Sven Claes');
	await expect(facts).toContainText('1976');
	await expect(facts).toContainText('26/09/2026 – 25/10/2026');
	await expect(facts).toContainText('2 metingen');

	const summary = page.getByRole('region', { name: 'Samenvatting' });
	await expect(summary.locator('tbody tr').first()).toHaveText(/Alle metingen\s*160 \/ 95\s*Gemiddeld verhoogd \/ licht verhoogd\s*2/);
	await expect(page.getByRole('region', { name: 'Per maand' }).locator('tbody tr')).toHaveText([
		/Oktober 2026\s*160 \/ 95.*2\*/
	]);
	await expect(page.locator('figure')).toHaveCount(2);
	await expect(page.locator('.log tbody tr')).toHaveText([
		/22\/10\/2026\s*21:00\s*182 E\s*104 G\s*avond\s*hoofdpijn; moe/,
		/25\/10\/2026\s*07:42\s*138 L\s*86 L\s*ochtend/
	]);
	await expect(page.getByText(/licht verhoogd vanaf 135\/85, gemiddeld verhoogd vanaf 160\/100/)).toBeVisible();

	// Back on the export screen the name and year are remembered.
	await page.goto('/export');
	await expect(page.getByLabel('Naam')).toHaveValue('Sven Claes');
	await expect(page.getByLabel('Geboortejaar')).toHaveValue('1976');
});

test('refuses an implausible birth year', async ({ page }) => {
	await page.getByLabel('Geboortejaar').fill('2099');
	await expect(page.getByRole('alert')).toHaveText('Vul een geboortejaar in, bijvoorbeeld 1976.');
	await expect(page.getByRole('button', { name: 'Rapport maken' })).toBeDisabled();
});

test('the report prints, with the toolbar hidden on paper', async ({ page }) => {
	await page.goto('/report?from=2026-10-01&to=2026-10-25');
	await expect(page.getByRole('heading', { name: 'Bloeddrukrapport' })).toBeVisible();
	await page.evaluate(() => {
		(window as unknown as { printed: boolean }).printed = false;
		window.print = () => {
			(window as unknown as { printed: boolean }).printed = true;
		};
	});
	await page.getByRole('button', { name: 'Afdrukken of opslaan als PDF' }).click();
	expect(await page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(true);

	await page.emulateMedia({ media: 'print' });
	await expect(page.getByRole('button', { name: 'Afdrukken of opslaan als PDF' })).toBeHidden();
	await expect(page.locator('.log tbody tr')).toHaveCount(2);
});

test('an empty period says so', async ({ page }) => {
	await page.goto('/report?from=2026-01-01&to=2026-01-31');
	await expect(page.getByText('Geen metingen in deze periode.')).toBeVisible();
	await expect(page.locator('.facts')).toContainText('0 metingen');
});
