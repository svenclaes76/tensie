import { expect, test } from '@playwright/test';

test('app shell loads in Dutch', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Nieuwe meting' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'nl-BE');
});

test('web app manifest and icons are served (N1)', async ({ page, request }) => {
	await page.goto('/');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBe('/manifest.webmanifest');

	const response = await request.get(href!);
	expect(response.ok()).toBe(true);
	const manifest = await response.json();
	expect(manifest).toMatchObject({
		name: 'Tensie',
		display: 'standalone',
		theme_color: '#1F6F66',
		start_url: '/'
	});
	const purposes = manifest.icons.map((i: { sizes: string; purpose?: string }) =>
		i.purpose === 'maskable' ? `maskable ${i.sizes}` : i.sizes
	);
	expect(purposes).toEqual(expect.arrayContaining(['192x192', '512x512', 'maskable 512x512']));

	for (const src of [
		...manifest.icons.map((i: { src: string }) => i.src),
		'/apple-touch-icon-180x180.png'
	]) {
		expect((await request.get(src)).ok(), src).toBe(true);
	}
});

test('starts offline once the service worker is installed (N1)', async ({ page, context }) => {
	await page.goto('/');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	// The first visit is not controlled yet; reload so the service worker serves the page.
	await page.reload();
	expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('link', { name: 'Nieuwe meting' })).toBeVisible();

	// Deep links fall back to the precached app shell too, and the screen works offline.
	await page.goto('/list');
	await expect(page.getByRole('heading', { name: 'Metingen', level: 1 })).toBeVisible();
});
