import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = resolve('tests/fixtures/sample-import.xlsx');

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

test('imports the sample file, confirms one flagged row, and undoes the import (C9)', async ({
	page
}) => {
	await page.goto('/importeren');
	await expect(page.getByRole('heading', { name: 'Importeren', level: 1 })).toBeVisible();

	await page.locator('input[type="file"]').setInputFiles(FIXTURE);

	// Columns recognised as in the design: C Datum, D Uur, F Boven, E Onder, G untitled.
	await expect(page.getByText('sample-import.xlsx')).toBeVisible();
	await expect(page.getByText('Blad1 · titels op rij 2 · 96 metingen')).toBeVisible();
	await expect(page.getByLabel('Datum', { exact: true }).locator('option:checked')).toHaveText('C · Datum');
	await expect(page.getByLabel('Tijd').locator('option:checked')).toHaveText('D · Uur');
	await expect(page.getByLabel('Bovendruk').locator('option:checked')).toHaveText('F · Boven');
	await expect(page.getByLabel('Onderdruk').locator('option:checked')).toHaveText('E · Onder');
	await expect(page.getByLabel('Notitie').locator('option:checked')).toHaveText('G · (zonder titel)');
	await expect(page.getByText(/Waarden in cmHg herkend \(13,7 \/ 8,4\)/)).toBeVisible();

	// 94 ready, 2 flagged and not imported unless ticked.
	const check = page.getByRole('region', { name: 'Controle' });
	await expect(check.getByText('Klaar om te importeren')).toBeVisible();
	await expect(check.getByText('Rij 23 · 05/08/2022 08:30')).toBeVisible();
	await expect(check.getByText('Datum valt buiten de volgorde')).toBeVisible();
	await expect(check.getByText('Datum ligt in de toekomst')).toBeVisible();
	const importButton = page.getByRole('button', { name: /importeren$/ });
	await expect(importButton).toHaveText('94 metingen importeren');

	await check.getByRole('checkbox', { name: /Rij 23/ }).check();
	await expect(importButton).toHaveText('95 metingen importeren');

	await importButton.click();
	await expect(page.getByRole('heading', { name: '95 metingen geïmporteerd' })).toBeFocused();
	await expect(page.getByText('1 te controleren rij is niet geïmporteerd.')).toBeVisible();

	// The import is listed in the history.
	const history = page.getByRole('region', { name: 'Eerdere imports' });
	await expect(history.getByText('sample-import.xlsx')).toBeVisible();
	await expect(history.getByText(/95 metingen/)).toBeVisible();

	// Importing the same file again finds only duplicates.
	await page.getByRole('button', { name: 'Nog een bestand kiezen' }).click();
	await page.locator('input[type="file"]').setInputFiles(FIXTURE);
	await expect(check.getByText('Al aanwezig, overgeslagen')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Niets om te importeren' })).toBeDisabled();
	// Row 43 (future) was not imported, so it is still offered.
	await expect(check.getByText(/Rij 43/)).toBeVisible();

	// Undo asks first, then removes the whole import.
	await history.getByRole('button', { name: 'Ongedaan maken' }).click();
	await expect(history.getByText('95 metingen uit deze import verwijderen?')).toBeVisible();
	await expect(history.getByRole('button', { name: 'Ja, verwijderen' })).toBeFocused();
	await history.getByRole('button', { name: 'Ja, verwijderen' }).click();
	await expect(history.getByText(/Ongedaan gemaakt op/)).toBeVisible();

	// After undo the file imports as new again.
	await page.getByRole('button', { name: /Ander/ }).click();
	await page.locator('input[type="file"]').setInputFiles(FIXTURE);
	await expect(page.getByRole('button', { name: '94 metingen importeren' })).toBeEnabled();
});

test('asks for the columns when a file has unknown headers', async ({ page }) => {
	await page.goto('/importeren');
	await page.locator('input[type="file"]').setInputFiles({
		name: 'metingen.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from('Wanneer;Hoog;Laag\n18/07/2025 08:30;135;85\n18/07/2025 21:00;140;90\n')
	});

	await expect(page.getByText('De kolommen zijn niet herkend.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Niets om te importeren' })).toBeDisabled();

	await page.getByLabel('Datum', { exact: true }).selectOption({ label: 'A · Wanneer' });
	await page.getByLabel('Bovendruk').selectOption({ label: 'B · Hoog' });
	await page.getByLabel('Onderdruk').selectOption({ label: 'C · Laag' });

	await expect(page.getByRole('button', { name: '2 metingen importeren' })).toBeEnabled();
	await page.getByRole('button', { name: '2 metingen importeren' }).click();
	await expect(page.getByRole('heading', { name: '2 metingen geïmporteerd' })).toBeVisible();
});

test('rejects a file that is not a spreadsheet', async ({ page }) => {
	await page.goto('/importeren');
	await page.locator('input[type="file"]').setInputFiles({
		name: 'foto.png',
		mimeType: 'image/png',
		buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
	});
	await expect(page.getByRole('alert')).toHaveText(/kan niet gelezen worden/);
});
