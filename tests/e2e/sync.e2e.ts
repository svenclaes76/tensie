import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 800 } });

// The test build has no Supabase project configured: the app must stay fully local.

test('Instellingen says sync is not set up and the app stays local', async ({ page }) => {
	await page.goto('/settings');
	const section = page.getByRole('region', { name: 'Synchronisatie' });
	await expect(section).toContainText('Synchronisatie is niet ingesteld: je metingen staan alleen op dit toestel.');
	await expect(section.getByRole('textbox')).toHaveCount(0);
});

test('entry works without any server', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (request) => {
		if (!request.url().startsWith('http://localhost')) requests.push(request.url());
	});
	await page.goto('/new');
	await page.getByLabel('Bovendruk').pressSequentially('138');
	await page.getByLabel('Onderdruk').pressSequentially('86');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page).toHaveURL('/list');
	// Nothing leaves the device (P4: no third parties either).
	expect(requests).toEqual([]);
});
