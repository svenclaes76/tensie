import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseRemote } from './supabaseRemote';

const USER = '11111111-1111-4111-8111-111111111111';

/** Records the query-builder calls supabase-js would make. */
function fakeClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
	const calls: [string, ...unknown[]][] = [];
	const builder: Record<string, unknown> = {};
	for (const method of ['select', 'order', 'limit', 'gt']) {
		builder[method] = (...args: unknown[]) => {
			calls.push([method, ...args]);
			return builder;
		};
	}
	builder.upsert = (...args: unknown[]) => {
		calls.push(['upsert', ...args]);
		return Promise.resolve({ error: result.error ?? null });
	};
	builder.then = (resolve: (value: unknown) => void) =>
		resolve({ data: result.data ?? [], error: result.error ?? null });
	const client = {
		from: vi.fn((table: string) => {
			calls.push(['from', table]);
			return builder;
		})
	} as unknown as SupabaseClient;
	return { client, calls };
}

describe('supabaseRemote', () => {
	it('upserts rows for the signed-in owner, keyed on user_id and id', async () => {
		const { client, calls } = fakeClient();
		await supabaseRemote(client, USER).push('readings', [{ id: 'r1', updated_at: '2026-10-25T07:00:00.000Z' }]);
		expect(calls).toEqual([
			['from', 'readings'],
			['upsert', [{ id: 'r1', updated_at: '2026-10-25T07:00:00.000Z', user_id: USER }], { onConflict: 'user_id,id' }]
		]);
	});

	it('pulls by server synced_at, oldest first, after the cursor', async () => {
		const { client, calls } = fakeClient({ data: [{ id: 'r1', user_id: USER, updated_at: 'x', synced_at: 'y' }] });
		const rows = await supabaseRemote(client, USER).pull('settings', '2026-10-25T07:00:00.000Z', 500);
		expect(calls).toEqual([
			['from', 'settings'],
			['select', '*'],
			['order', 'synced_at', { ascending: true }],
			['limit', 500],
			['gt', 'synced_at', '2026-10-25T07:00:00.000Z']
		]);
		// user_id stays on the server side.
		expect(rows).toEqual([{ id: 'r1', updated_at: 'x', synced_at: 'y' }]);
	});

	it('pulls everything on the first round', async () => {
		const { client, calls } = fakeClient();
		await supabaseRemote(client, USER).pull('imports', null, 500);
		expect(calls.some(([method]) => method === 'gt')).toBe(false);
	});

	it('turns API errors into failures, so the round retries and nothing is marked done', async () => {
		const { client } = fakeClient({ error: { message: 'JWT expired' } });
		await expect(supabaseRemote(client, USER).push('readings', [])).rejects.toThrow('Push readings: JWT expired');
		await expect(supabaseRemote(client, USER).pull('readings', null, 1)).rejects.toThrow('Pull readings: JWT expired');
	});
});
