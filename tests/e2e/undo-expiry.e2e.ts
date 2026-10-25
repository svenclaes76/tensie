import { expect, test } from '@playwright/test';
import { seed, stored } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

test('the undo offer counts down and is gone after 10 seconds (C7)', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-10-25T08:58:00Z') });
	await seed(page, [{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86 }]);
	await page.getByRole('table', { name: 'Alle metingen' }).locator('tbody tr.reading').first().click();
	await page.getByRole('button', { name: 'Verwijderen' }).click();
	await expect(page).toHaveURL('/list');

	const status = page.getByRole('status');
	await expect(status).toHaveText(/Ongedaan maken \(10\)/);
	await page.clock.runFor(4_000);
	await expect(status).toHaveText(/Ongedaan maken \(6\)/);
	await page.clock.runFor(6_500);
	await expect(page.getByRole('button', { name: /Ongedaan maken/ })).toHaveCount(0);
	await expect(page.getByText('Nog geen metingen.')).toBeVisible();
	// The deletion stays, as a soft delete that sync will pass on.
	expect(await stored(page)).toEqual([expect.objectContaining({ deleted: true })]);
});
