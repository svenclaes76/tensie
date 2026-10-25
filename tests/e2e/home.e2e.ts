import { expect, test, type Page } from '@playwright/test';
import { seed, type Seed } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

// Today is Sunday 25 October 2026 in Brussels.
const NOW = new Date('2026-10-25T08:58:00Z');

const THIS_WEEK: Seed[] = [
	{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86 },
	{ at: '2026-10-24T21:15:00+02:00', systolic: 152, diastolic: 96 }
];
const LAST_WEEK: Seed[] = [
	{ at: '2026-10-17T07:30:00+02:00', systolic: 150, diastolic: 94 },
	{ at: '2026-10-16T21:00:00+02:00', systolic: 146, diastolic: 90 }
];

function card(page: Page, name: string) {
	return page.getByRole('region', { name });
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(NOW);
});

test('shows the last reading and the 7-day average with a trend (H7)', async ({ page }) => {
	await seed(page, [...THIS_WEEK, ...LAST_WEEK]);
	await page.goto('/');

	const last = card(page, 'Laatste meting');
	await expect(last).toContainText('zo 25 okt · 07:42');
	await expect(last.locator('.big')).toHaveText(['138', '86']);
	await expect(last.locator('.badge')).toHaveText(['Licht verhoogd', 'Licht verhoogd']);
	await expect(last).toContainText('mmHg · ochtend');

	const week = card(page, 'Gemiddelde laatste 7 dagen');
	await expect(week.locator('.average')).toHaveText('145 / 91');
	await expect(week.locator('.badge')).toHaveText(['Boven · Bovendruk: Licht verhoogd', 'Onder · Onderdruk: Licht verhoogd']);
	// This week 145/91, last week 148/92.
	await expect(week.locator('.trend')).toHaveText('3 / 1 mmHg lager dan vorige week');
	await expect(week.locator('.parts')).toHaveText(/Ochtend\s*138 \/ 86\s*Avond\s*152 \/ 96/);
	await expect(page.getByText(/neem contact op met je arts of bel 112/)).toBeVisible();
});

test('a mixed trend says which value went which way', async ({ page }) => {
	await seed(page, [
		{ at: '2026-10-24T07:30:00+02:00', systolic: 140, diastolic: 96 },
		{ at: '2026-10-17T07:30:00+02:00', systolic: 150, diastolic: 90 }
	]);
	await page.goto('/');
	await expect(card(page, 'Gemiddelde laatste 7 dagen').locator('.trend')).toHaveText(
		'Bovendruk 10 lager, onderdruk 6 hoger dan vorige week'
	);
});

test('without readings last week there is nothing to compare', async ({ page }) => {
	await seed(page, THIS_WEEK);
	await page.goto('/');
	await expect(card(page, 'Gemiddelde laatste 7 dagen').locator('.trend')).toHaveText(
		'Nog niet genoeg metingen om met vorige week te vergelijken.'
	);
});

test('an old last reading with no readings this week', async ({ page }) => {
	await seed(page, [{ at: '2025-10-10T21:00:00+02:00', systolic: 143, diastolic: 96 }]);
	await page.goto('/');
	await expect(card(page, 'Laatste meting')).toContainText('vr 10 okt 2025 · 21:00');
	await expect(card(page, 'Gemiddelde laatste 7 dagen')).toContainText('Geen metingen in de laatste 7 dagen.');
});

test('a new user is welcomed and can add or import', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Welkom bij Tensie' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Importeren uit Excel' })).toHaveAttribute('href', '/import');
	await page.getByRole('link', { name: 'Nieuwe meting' }).click();
	await expect(page).toHaveURL('/new');
});

test('the home updates live and links to settings', async ({ page }) => {
	await page.goto('/new');
	await page.getByLabel('Bovendruk').pressSequentially('146');
	await page.getByLabel('Onderdruk').pressSequentially('88');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page).toHaveURL('/list');
	await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Home' }).click();
	await expect(card(page, 'Laatste meting').locator('.big')).toHaveText(['146', '88']);
	await expect(page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Home' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.getByRole('link', { name: 'Instellingen' }).click();
	await expect(page).toHaveURL('/settings');
});
