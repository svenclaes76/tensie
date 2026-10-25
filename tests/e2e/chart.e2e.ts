import { expect, test, type Page } from '@playwright/test';
import { seed, type Seed } from './helpers';

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 360, height: 800 } });

// Today is Sunday 25 October 2026 in Brussels.
const NOW = new Date('2026-10-25T08:58:00Z');

const SEED: Seed[] = [
	{ at: '2026-10-25T07:42:00+01:00', systolic: 138, diastolic: 86 },
	{ at: '2026-10-24T21:15:00+02:00', systolic: 150, diastolic: 92 },
	{ at: '2026-10-22T21:00:00+02:00', systolic: 182, diastolic: 104 },
	{ at: '2026-10-19T07:30:00+02:00', systolic: 128, diastolic: 80 },
	// Outside the last 7 days, inside the last 30.
	{ at: '2026-10-10T08:00:00+02:00', systolic: 160, diastolic: 101 },
	// Inside the last year only.
	{ at: '2026-03-02T08:00:00+01:00', systolic: 145, diastolic: 88 }
];

function chartCard(page: Page) {
	return page.getByRole('region', { name: /in mmHg/ });
}

function stat(page: Page, label: string) {
	return page.locator('.stat').filter({ hasText: label }).locator('.stat-value');
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(NOW);
	await seed(page, SEED);
	await page.goto('/chart');
});

test('shows the last 7 days of bovendruk with bands, dots and stats (H2, H5)', async ({ page }) => {
	await expect(page.getByRole('heading', { name: 'Verloop', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: '7 d' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Bovendruk' })).toHaveAttribute('aria-pressed', 'true');
	await expect(chartCard(page).getByRole('heading')).toHaveText('Bovendruk in mmHg · 19–25 okt');

	const chart = page.getByRole('slider', { name: /Bovendruk in mmHg/ });
	await expect(chart).toHaveAttribute('aria-label', 'Bovendruk in mmHg, 19–25 okt: 4 metingen, gemiddeld 150');
	// Every reading in 7 days gets a dot, coloured by its category.
	const dots = page.locator('circle.dot');
	await expect(dots).toHaveCount(4);
	// Oldest first: 128, 182, 150, 138.
	await expect(dots.nth(1)).toHaveAttribute('fill', '#8F1D4F'); // 182, severe
	await expect(dots.nth(0)).toHaveAttribute('fill', '#1F8A70'); // 128, normal
	for (const band of ['Normaal', 'Licht', 'Gemiddeld', 'Ernstig']) {
		await expect(page.locator('text.band-label', { hasText: band })).toHaveCount(1);
	}
	await expect(page.locator('line.threshold')).toHaveCount(3);

	await expect(stat(page, 'Gemiddeld')).toHaveText('150 / 91');
	await expect(stat(page, 'Hoogste')).toHaveText('182 / 104');
	await expect(stat(page, 'Laagste')).toHaveText('128 / 80');

	const nav = page.getByRole('navigation', { name: 'Hoofdmenu' });
	await expect(nav.getByRole('link', { name: 'Grafiek' })).toHaveAttribute('aria-current', 'page');
});

test('switches to onderdruk', async ({ page }) => {
	await page.getByRole('button', { name: 'Onderdruk' }).click();
	await expect(chartCard(page).getByRole('heading')).toHaveText('Onderdruk in mmHg · 19–25 okt');
	await expect(page.locator('line.threshold')).toHaveCount(3);
	await expect(stat(page, 'Hoogste')).toHaveText('182 / 104');
	await expect(stat(page, 'Laagste')).toHaveText('128 / 80');
	await expect(page.getByText('de meting met de hoogste of laagste onderdruk')).toBeVisible();
});

test('longer periods: 30 days with all dots, a year as weekly averages', async ({ page }) => {
	await page.getByRole('button', { name: '30 d' }).click();
	await expect(chartCard(page).getByRole('heading')).toHaveText('Bovendruk in mmHg · 26 sep–25 okt');
	await expect(page.locator('circle.dot')).toHaveCount(5);

	await page.getByRole('button', { name: '1 jaar' }).click();
	await expect(chartCard(page).getByRole('heading')).toHaveText(
		'Bovendruk in mmHg · 26 okt 2025–25 okt 2026 · per week'
	);
	await page.getByText('Toon als tabel').click();
	const rows = page.locator('.table-view tbody tr');
	await expect(rows).toHaveText([
		// Thursday 22 October belongs to the week of Monday 19 October.
		/week van ma 19\/10\s*\(4×\)\s*150\s*Licht verhoogd/,
		/week van ma 05\/10\s*160\s*Gemiddeld verhoogd/,
		/week van ma 02\/03\s*145\s*Licht verhoogd/
	]);
	// Beyond 31 days only raised points (moderate, severe) get a dot: here the 160 week.
	await expect(page.locator('circle.dot')).toHaveCount(1);
	// Stats still come from the individual readings.
	await expect(stat(page, 'Hoogste')).toHaveText('182 / 104');
});

test('a custom range (H2)', async ({ page }) => {
	await page.getByRole('button', { name: 'Anders' }).click();
	await page.getByLabel('Van').fill('2026-03-01');
	await page.getByLabel('Tot en met').fill('2026-03-31');
	await expect(chartCard(page).getByRole('heading')).toHaveText('Bovendruk in mmHg · 1–31 mrt');
	await expect(page.locator('circle.dot')).toHaveCount(1);
	await expect(stat(page, 'Gemiddeld')).toHaveText('145 / 88');
});

test('an empty period says so and shows no numbers', async ({ page }) => {
	await page.getByRole('button', { name: 'Anders' }).click();
	await page.getByLabel('Van').fill('2026-05-01');
	await page.getByLabel('Tot en met').fill('2026-05-31');
	await expect(page.getByText('Geen metingen in deze periode.')).toBeVisible();
	await expect(stat(page, 'Gemiddeld')).toHaveText('–');
	await expect(page.getByText('Toon als tabel')).toHaveCount(0);
});

test('hovering snaps a crosshair to the nearest reading and shows it', async ({ page }) => {
	const dot = page.locator('circle.dot').nth(1); // 182
	const box = (await dot.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2 + 3, box.y + 60);
	const tooltip = page.locator('.tooltip');
	await expect(tooltip).toContainText('182');
	await expect(tooltip).toContainText('Ernstig verhoogd');
	await expect(tooltip).toContainText('do 22/10 21:00');
	await expect(page.locator('line.crosshair')).toHaveCount(1);
	await page.mouse.move(5, 5);
	await expect(tooltip).toHaveCount(0);
});

test('the keyboard walks through the readings', async ({ page }) => {
	const chart = page.getByRole('slider', { name: /Bovendruk in mmHg/ });
	await chart.focus();
	await expect(chart).toHaveAttribute('aria-valuetext', '138 mmHg, licht verhoogd, zo 25/10 07:42');
	await page.keyboard.press('ArrowLeft');
	await expect(chart).toHaveAttribute('aria-valuetext', '150 mmHg, licht verhoogd, za 24/10 21:15');
	await page.keyboard.press('Home');
	await expect(chart).toHaveAttribute('aria-valuetext', '128 mmHg, normaal, ma 19/10 07:30');
	await expect(chart).toHaveAttribute('aria-valuenow', '1');
	await page.keyboard.press('Escape');
	await expect(page.locator('.tooltip')).toHaveCount(0);
});

test('the table view lists every point, newest first', async ({ page }) => {
	await page.getByText('Toon als tabel').click();
	await expect(page.locator('.table-view tbody tr')).toHaveText([
		/zo 25\/10 07:42\s*138\s*Licht verhoogd/,
		/za 24\/10 21:15\s*150\s*Licht verhoogd/,
		/do 22\/10 21:00\s*182\s*Ernstig verhoogd/,
		/ma 19\/10 07:30\s*128\s*Normaal/
	]);
});
