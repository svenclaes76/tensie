import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Revision for the precached fallback page; changes with every build.
const buildId = Date.now().toString();

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA: Dexie only exists in the browser, so every route is served by the fallback page.
			adapter: adapter({ fallback: 'index.html' })
		}),
		VitePWA({
			// 'prompt' so a new version shows "Update beschikbaar" instead of reloading silently (N1).
			registerType: 'prompt',
			injectRegister: false,
			// SvelteKit's adapter writes build/ after this plugin runs, so the service worker goes into
			// the client output that the adapter copies. The fallback index.html is only created by the
			// adapter, hence the explicit precache entry below.
			outDir: '.svelte-kit/output/client',
			includeManifestIcons: false,
			manifest: {
				name: 'Tensie',
				short_name: 'Tensie',
				description: 'Bloeddruk bijhouden',
				lang: 'nl-BE',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				theme_color: '#1F6F66',
				background_color: '#F6F7F5',
				// Long-press on the home screen icon opens entry directly.
				shortcuts: [
					{
						name: 'Nieuwe meting',
						url: '/new',
						icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
					}
				],
				icons: [
					{ src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				globDirectory: '.svelte-kit/output/client',
				globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
				// '/' rather than 'index.html': hosts and the preview server serve the shell at '/', and
				// Cloudflare Pages redirects /index.html.
				additionalManifestEntries: [{ url: '/', revision: buildId }],
				navigateFallback: '/'
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
