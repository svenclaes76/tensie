import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Revision for the precached fallback page; changes with every build.
const buildId = Date.now().toString();

// The only server the app talks to: the Supabase project from .env, if one is configured.
const supabaseUrl = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? (new URL(supabaseUrl).origin as `https://${string}.${string}`) : null;

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA: Dexie only exists in the browser, so every route is served by the fallback page.
			adapter: adapter({ fallback: 'index.html' }),
			// Content Security Policy as a <meta> tag with hashes of SvelteKit's own inline scripts:
			// nothing else may run, and data may only go to this site and the Supabase project.
			// frame-ancestors cannot be set in a meta tag; static/_headers adds it.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte sets a few inline styles (chart tooltip position).
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': supabaseOrigin ? ['self', supabaseOrigin] : ['self'],
					'worker-src': ['self'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
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
					include: ['src/**/*.{test,spec}.{js,ts}', 'supabase/**/*.test.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
