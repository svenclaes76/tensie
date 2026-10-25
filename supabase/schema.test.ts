import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Runs the real migration in an in-process Postgres (PGlite) with a stand-in for Supabase's auth
 * schema and API roles, and checks row-level security and last-change-wins as the API would hit
 * them: as the `authenticated` or `anon` role with a JWT subject set.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const READING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let db: PGlite;

const SUPABASE_STANDIN = `
	create schema auth;
	create table auth.users (id uuid primary key);
	create function auth.uid() returns uuid language sql stable as $$
		select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
	$$;
	create role anon nologin;
	create role authenticated nologin;
	grant usage on schema public to anon, authenticated;
	grant usage on schema auth to anon, authenticated;
	-- Supabase grants table rights to the API roles by default; the migration narrows them.
	alter default privileges in schema public grant all on tables to anon, authenticated;
	insert into auth.users values ('${OWNER}'), ('${OTHER}');
`;

async function as(role: 'authenticated' | 'anon' | 'postgres', user?: string) {
	await db.exec('reset role');
	await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
	if (role !== 'postgres') await db.exec(`set role ${role}`);
}

/** What PostgREST runs for supabase-js upsert(rows, { onConflict: 'user_id,id' }). */
async function upsertReading(values: { userId?: string; id?: string; systolic: number; updatedAt: string; deleted?: boolean }) {
	await db.query(
		`insert into public.readings
			(user_id, id, measured_at, time_zone, systolic, diastolic, source, created_at, updated_at, deleted)
		values (coalesce($1::uuid, auth.uid()), $2, '2026-10-25T06:42:00Z', 'Europe/Brussels', $3, 86, 'manual',
			'2026-10-25T06:42:00Z', $4, $5)
		on conflict (user_id, id) do update set
			systolic = excluded.systolic, updated_at = excluded.updated_at, deleted = excluded.deleted`,
		[values.userId ?? null, values.id ?? READING, values.systolic, values.updatedAt, values.deleted ?? false]
	);
}

async function stored() {
	return (
		await db.query<{ systolic: number; updated_at: Date; synced_at: Date; deleted: boolean; user_id: string }>(
			'select systolic, updated_at, synced_at, deleted, user_id from public.readings order by id'
		)
	).rows;
}

beforeAll(async () => {
	db = new PGlite();
	await db.exec(SUPABASE_STANDIN);
	await db.exec(readFileSync(resolve('supabase/migrations/20261025000000_init.sql'), 'utf8'));
});

afterAll(async () => {
	await db.close();
});

beforeEach(async () => {
	await as('postgres');
	await db.exec('truncate public.readings, public.settings, public.imports');
});

describe('row-level security', () => {
	it('lets the owner add and read their readings, with user_id filled in', async () => {
		await as('authenticated', OWNER);
		await upsertReading({ systolic: 138, updatedAt: '2026-10-25T07:00:00Z' });
		expect(await stored()).toEqual([expect.objectContaining({ systolic: 138, user_id: OWNER })]);
	});

	it('hides one owner’s readings from another', async () => {
		await as('authenticated', OWNER);
		await upsertReading({ systolic: 138, updatedAt: '2026-10-25T07:00:00Z' });
		await as('authenticated', OTHER);
		expect(await stored()).toEqual([]);
	});

	it('refuses writing a row for someone else', async () => {
		await as('authenticated', OTHER);
		await expect(upsertReading({ userId: OWNER, systolic: 200, updatedAt: '2026-10-26T07:00:00Z' })).rejects.toThrow(
			/row-level security/
		);
	});

	it('cannot change another owner’s reading through an update', async () => {
		await as('authenticated', OWNER);
		await upsertReading({ systolic: 138, updatedAt: '2026-10-25T07:00:00Z' });
		await as('authenticated', OTHER);
		const result = await db.query(`update public.readings set systolic = 250, updated_at = '2027-01-01Z' where id = $1`, [
			READING
		]);
		expect(result.affectedRows).toBe(0);
		await as('authenticated', OWNER);
		expect((await stored())[0].systolic).toBe(138);
	});

	it('cannot hand a reading to another owner', async () => {
		await as('authenticated', OWNER);
		await upsertReading({ systolic: 138, updatedAt: '2026-10-25T07:00:00Z' });
		// The trigger keeps the owner before the policy check, so the change simply does not stick.
		await db.query(`update public.readings set user_id = $1, updated_at = '2027-01-01Z' where id = $2`, [OTHER, READING]);
		expect((await stored())[0].user_id).toBe(OWNER);
		await as('authenticated', OTHER);
		expect(await stored()).toEqual([]);
	});

	it('gives the public (anon) key nothing', async () => {
		await as('authenticated', OWNER);
		await upsertReading({ systolic: 138, updatedAt: '2026-10-25T07:00:00Z' });
		await as('anon');
		await expect(db.query('select * from public.readings')).rejects.toThrow(/permission denied/);
		await expect(upsertReading({ userId: OWNER, systolic: 1, updatedAt: '2027-01-01Z' })).rejects.toThrow(
			/permission denied/
		);
		for (const table of ['settings', 'imports']) {
			await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
		}
	});

	it('allows no hard deletes, only the deleted flag', async () => {
		await as('authenticated', OWNER);
		await upsertReading({ systolic: 138, updatedAt: '2026-10-25T07:00:00Z' });
		await expect(db.query('delete from public.readings')).rejects.toThrow(/permission denied/);
		await expect(db.query('truncate public.readings')).rejects.toThrow(/permission denied/);
		await upsertReading({ systolic: 138, updatedAt: '2026-10-25T08:00:00Z', deleted: true });
		expect((await stored())[0].deleted).toBe(true);
	});

	it('has RLS enabled on every table', async () => {
		await as('postgres');
		const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
			`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`
		);
		expect(rows).toEqual([
			{ relname: 'imports', relrowsecurity: true },
			{ relname: 'readings', relrowsecurity: true },
			{ relname: 'settings', relrowsecurity: true }
		]);
	});
});

describe('last change wins', () => {
	beforeEach(async () => {
		await as('authenticated', OWNER);
		await upsertReading({ systolic: 140, updatedAt: '2026-10-25T08:00:00Z' });
	});

	it('takes a newer change', async () => {
		await upsertReading({ systolic: 145, updatedAt: '2026-10-25T09:00:00Z' });
		expect((await stored())[0].systolic).toBe(145);
	});

	it('ignores an older change, e.g. from a device that was offline', async () => {
		await upsertReading({ systolic: 120, updatedAt: '2026-10-25T07:00:00Z' });
		expect((await stored())[0]).toMatchObject({ systolic: 140, updated_at: new Date('2026-10-25T08:00:00Z') });
	});

	it('treats an equal change as nothing new: synced_at stays', async () => {
		const [before] = await stored();
		await upsertReading({ systolic: 140, updatedAt: '2026-10-25T08:00:00Z' });
		expect((await stored())[0].synced_at).toEqual(before.synced_at);
	});

	it('stamps synced_at with the server clock on every accepted change', async () => {
		const [before] = await stored();
		await upsertReading({ systolic: 145, updatedAt: '2026-10-25T09:00:00Z' });
		const [after] = await stored();
		expect(after.synced_at.getTime()).toBeGreaterThan(before.synced_at.getTime());
		// Not something a client can set.
		await db.query(`update public.readings set synced_at = '2000-01-01Z', updated_at = '2026-10-25T10:00:00Z'`);
		expect((await stored())[0].synced_at.getFullYear()).toBeGreaterThan(2020);
	});
});

describe('constraints', () => {
	it('keeps settings to one row per owner, id "settings"', async () => {
		await as('authenticated', OWNER);
		const insert = (id: string) =>
			db.query(
				`insert into public.settings (id, time_zone, thresholds, day_part_windows, updated_at)
				values ($1, 'Europe/Brussels', '{}', '{}', now())`,
				[id]
			);
		await insert('settings');
		await expect(insert('other')).rejects.toThrow(/check constraint/);
		await expect(insert('settings')).rejects.toThrow(/duplicate key/);
	});

	it('refuses implausible values', async () => {
		await as('authenticated', OWNER);
		await expect(upsertReading({ systolic: 0, updatedAt: '2026-10-25T08:00:00Z' })).rejects.toThrow(/check constraint/);
	});
});
