import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The service with a fake Supabase client: the login calls it makes, its error wording, and a
 * whole background round from a local change to an upsert.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const auth = {
	signInWithOtp: vi.fn(),
	verifyOtp: vi.fn(),
	signOut: vi.fn(async () => ({ error: null })),
	getSession: vi.fn(),
	onAuthStateChange: vi.fn()
};
const upserts: unknown[][] = [];

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => {
		const builder: Record<string, unknown> = {};
		for (const method of ['select', 'order', 'limit', 'gt']) builder[method] = () => builder;
		builder.upsert = (rows: unknown[]) => {
			upserts.push(rows);
			return Promise.resolve({ error: null });
		};
		builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
		return { auth, from: () => builder };
	})
}));

async function loadService() {
	vi.resetModules();
	vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
	vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
	return import('./service.svelte');
}

beforeEach(() => {
	vi.stubGlobal('location', { origin: 'https://tensie.example.be' });
	vi.stubGlobal('navigator', { onLine: true });
	vi.stubGlobal('window', { addEventListener: vi.fn() });
	vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
	upserts.length = 0;
	for (const fn of Object.values(auth)) fn.mockClear();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('sync service', () => {
	it('is off without a project, and on with one', async () => {
		vi.resetModules();
		vi.stubEnv('VITE_SUPABASE_URL', '');
		const off = await import('./service.svelte');
		expect(off.syncConfigured).toBe(false);
		expect(off.sync.status).toBe('off');

		const on = await loadService();
		expect(on.syncConfigured).toBe(true);
		expect(on.sync.status).toBe('signed-out');
	});

	it('sends the login email without ever creating an account (P3)', async () => {
		const service = await loadService();
		auth.signInWithOtp.mockResolvedValue({ error: null });
		expect(await service.sendLoginEmail('sven@example.be')).toBeNull();
		expect(auth.signInWithOtp).toHaveBeenCalledWith({
			email: 'sven@example.be',
			options: { shouldCreateUser: false, emailRedirectTo: 'https://tensie.example.be/auth' }
		});
	});

	it.each([
		['Signups not allowed for otp', 'unknown-email'],
		['User not found', 'unknown-email'],
		['Failed to fetch', 'failed']
	])('reports "%s" as %s', async (message, expected) => {
		const service = await loadService();
		auth.signInWithOtp.mockResolvedValue({ error: { message } });
		expect(await service.sendLoginEmail('x@example.be')).toBe(expected);
	});

	it('logs in with the code from the email', async () => {
		const service = await loadService();
		auth.verifyOtp.mockResolvedValue({ error: null });
		expect(await service.verifyLoginCode('sven@example.be', '123456')).toBeNull();
		expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'sven@example.be', token: '123456', type: 'email' });

		auth.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
		expect(await service.verifyLoginCode('sven@example.be', '000000')).toBe('wrong-code');
	});

	it('syncs in the background once signed in: a local reading reaches the server', async () => {
		const service = await loadService();
		const { db } = await import('../data/db');
		const { addReading } = await import('../data/readings');
		await db.readings.clear();
		await addReading(db, {
			measuredAt: '2026-10-25T06:42:00.000Z',
			timeZone: 'Europe/Brussels',
			systolic: 138,
			diastolic: 86
		});

		auth.getSession.mockResolvedValue({
			data: { session: { user: { id: USER, email: 'sven@example.be' } } }
		});
		await service.startSync();
		expect(service.sync.email).toBe('sven@example.be');

		await vi.waitFor(() => expect(service.sync.status).toBe('idle'), { timeout: 5000 });
		await vi.waitFor(() => expect(service.sync.lastSyncedAt).not.toBeNull(), { timeout: 5000 });
		expect(upserts.flat()).toEqual([
			expect.objectContaining({ user_id: USER, systolic: 138, diastolic: 86, measured_at: '2026-10-25T06:42:00.000Z' })
		]);
		expect((await db.readings.toArray())[0].syncPending).toBe(0);
	});
});
