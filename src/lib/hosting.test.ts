import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Parses static/_headers into { path: { header: value } }, as Cloudflare Pages and Netlify do. */
function parseHeaders(text: string): Record<string, Record<string, string>> {
	const rules: Record<string, Record<string, string>> = {};
	let current: Record<string, string> | null = null;
	for (const line of text.split(/\r?\n/)) {
		if (line.trim() === '' || line.trim().startsWith('#')) continue;
		if (!/^\s/.test(line)) {
			current = rules[line.trim()] = {};
		} else if (current) {
			const [name, ...value] = line.trim().split(':');
			current[name.trim()] = value.join(':').trim();
		}
	}
	return rules;
}

const headers = parseHeaders(readFileSync(resolve('static/_headers'), 'utf8'));

describe('static/_headers', () => {
	it('sends the security headers on every page', () => {
		expect(headers['/*']).toMatchObject({
			'Strict-Transport-Security': expect.stringMatching(/max-age=\d{8,}/),
			'Content-Security-Policy': "frame-ancestors 'none'",
			'X-Frame-Options': 'DENY',
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'no-referrer',
			'X-Robots-Tag': expect.stringContaining('noindex')
		});
		expect(headers['/*']['Permissions-Policy']).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
	});

	it('caches hashed files for good and always rechecks the app entry points', () => {
		expect(headers['/_app/immutable/*']['Cache-Control']).toContain('immutable');
		for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
			expect(headers[path]?.['Cache-Control'], path).toBe('no-cache');
		}
	});
});

describe('static/robots.txt', () => {
	it('keeps search engines out', () => {
		expect(readFileSync(resolve('static/robots.txt'), 'utf8')).toMatch(/User-agent: \*\s+Disallow: \/\s*$/);
	});
});
