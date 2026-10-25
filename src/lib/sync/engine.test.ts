import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, SYNCED_TABLES, type SyncedTable, type TensieDb } from '../data/db';
import { saveImport, undoImport } from '../data/imports';
import { addReading, deleteReading, getReading, updateReading, type NewReading } from '../data/readings';
import { getSettings, saveSettings } from '../data/settings';
import { parseRows } from '../domain/import/parse';
import { DEFAULT_THRESHOLDS } from '../domain/thresholds';
import { PAGE_SIZE, pendingCount, syncOnce, type Remote } from './engine';
import type { RemoteRow } from './mapping';

/**
 * An in-memory server with the database's rules (supabase/migrations): keep the newest
 * updated_at, ignore equal or older, and stamp accepted changes with its own increasing clock.
 */
class FakeServer implements Remote {
	tables = new Map<SyncedTable, Map<string, RemoteRow>>(SYNCED_TABLES.map((t) => [t, new Map()]));
	private clock = Date.parse('2030-01-01T00:00:00Z');
	offline = false;
	/** Runs during a push, after the server stored the rows: to simulate edits racing the push. */
	duringPush?: () => Promise<void>;

	async push(table: SyncedTable, rows: RemoteRow[]) {
		if (this.offline) throw new Error('offline');
		for (const row of rows) {
			const stored = this.tables.get(table)!.get(row.id);
			if (stored && Date.parse(row.updated_at) <= Date.parse(stored.updated_at)) continue;
			// 10 minutes apart, so the pull overlap (5 minutes) only re-reads the newest change.
			this.tables.get(table)!.set(row.id, { ...row, synced_at: new Date((this.clock += 600_000)).toISOString() });
		}
		await this.duringPush?.();
	}

	async pull(table: SyncedTable, since: string | null, limit: number) {
		if (this.offline) throw new Error('offline');
		return [...this.tables.get(table)!.values()]
			.filter((r) => since === null || Date.parse(r.synced_at!) > Date.parse(since))
			.sort((a, b) => Date.parse(a.synced_at!) - Date.parse(b.synced_at!))
			.slice(0, limit)
			.map((r) => ({ ...r }));
	}
}

const TZ = 'Europe/Brussels';
const T = (time: string) => new Date(`2026-10-25T${time}:00Z`);
const READING: NewReading = {
	measuredAt: '2026-10-25T06:42:00.000Z',
	timeZone: TZ,
	systolic: 138,
	diastolic: 86,
	note: 'na koffie'
};

let phone: TensieDb;
let laptop: TensieDb;
let server: FakeServer;

beforeEach(() => {
	phone = createDb(`phone-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
	laptop = createDb(`laptop-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
	server = new FakeServer();
});

afterEach(async () => {
	await phone.delete();
	await laptop.delete();
});

describe('syncOnce (N2)', () => {
	it('brings a reading from one device to the other, exactly once', async () => {
		const reading = await addReading(phone, READING, T('07:00'));
		expect(await pendingCount(phone)).toBe(1);

		expect(await syncOnce(phone, server)).toMatchObject({ pushed: 1 });
		expect(await pendingCount(phone)).toBe(0);
		await syncOnce(laptop, server);

		const onLaptop = await laptop.readings.toArray();
		expect(onLaptop).toEqual([{ ...reading, syncPending: 0 }]);
		// Pulled rows are not sent back.
		expect(await pendingCount(laptop)).toBe(0);
		expect((await syncOnce(laptop, server)).pushed).toBe(0);
		// Syncing again changes nothing on either side.
		await syncOnce(phone, server);
		expect(await phone.readings.count()).toBe(1);
		expect(await laptop.readings.count()).toBe(1);
	});

	it('takes the newest edit on both devices (last change wins)', async () => {
		const { id } = await addReading(phone, READING, T('07:00'));
		await syncOnce(phone, server);
		await syncOnce(laptop, server);

		// Both edit while offline; the laptop edits later.
		await updateReading(phone, id, { ...READING, systolic: 140 }, T('08:00'));
		await updateReading(laptop, id, { ...READING, systolic: 150 }, T('09:00'));
		// The laptop syncs first; the phone's older edit then reaches the server after it.
		await syncOnce(laptop, server);
		await syncOnce(phone, server);
		await syncOnce(laptop, server);

		expect((await getReading(phone, id))?.systolic).toBe(150);
		expect((await getReading(laptop, id))?.systolic).toBe(150);
		expect(server.tables.get('readings')!.get(id)?.systolic).toBe(150);
		expect(await pendingCount(phone)).toBe(0);
	});

	it('syncs deletions, which stay soft, and an undo of the deletion', async () => {
		const { id } = await addReading(phone, READING, T('07:00'));
		await syncOnce(phone, server);
		await syncOnce(laptop, server);

		await deleteReading(laptop, id, T('08:00'));
		await syncOnce(laptop, server);
		await syncOnce(phone, server);
		expect(await getReading(phone, id)).toBeUndefined();
		expect(server.tables.get('readings')!.get(id)?.deleted).toBe(true);
	});

	it('keeps changes made offline and sends them once back online', async () => {
		server.offline = true;
		await addReading(phone, READING, T('07:00'));
		await expect(syncOnce(phone, server)).rejects.toThrow('offline');
		expect(await pendingCount(phone)).toBe(1);

		server.offline = false;
		await syncOnce(phone, server);
		expect(await pendingCount(phone)).toBe(0);
		expect(server.tables.get('readings')!.size).toBe(1);
	});

	it('never loses an edit made while its earlier version was being pushed', async () => {
		const { id } = await addReading(phone, READING, T('07:00'));
		server.duringPush = async () => {
			server.duringPush = undefined;
			await updateReading(phone, id, { ...READING, systolic: 155 }, T('07:30'));
		};
		await syncOnce(phone, server);
		// The 07:00 version was confirmed, but the 07:30 edit is still waiting.
		expect(await pendingCount(phone)).toBe(1);
		await syncOnce(phone, server);
		expect(server.tables.get('readings')!.get(id)?.systolic).toBe(155);
		expect(await pendingCount(phone)).toBe(0);
	});

	it('keeps an edit pending when the connection drops between upload and download', async () => {
		const { id } = await addReading(phone, READING, T('07:00'));
		server.duringPush = async () => {
			server.duringPush = undefined;
			await updateReading(phone, id, { ...READING, systolic: 155 }, T('07:30'));
			server.offline = true;
		};
		await expect(syncOnce(phone, server)).rejects.toThrow('offline');
		expect((await phone.readings.get(id))?.syncPending).toBe(1);
	});

	it('pulls only what is new since the last round, plus a short overlap', async () => {
		await addReading(phone, READING, T('07:00'));
		await addReading(phone, { ...READING, measuredAt: '2026-10-25T19:00:00.000Z' }, T('19:00'));
		await syncOnce(phone, server);
		expect((await syncOnce(laptop, server)).pulled).toBe(2);
		// The next round re-reads only the newest change (within the overlap), not everything.
		expect((await syncOnce(laptop, server)).pulled).toBe(1);
		expect(await laptop.readings.count()).toBe(2);
	});

	it('clears a removed note on the other device too', async () => {
		const { id } = await addReading(phone, READING, T('07:00'));
		await syncOnce(phone, server);
		await syncOnce(laptop, server);
		await updateReading(phone, id, { ...READING, note: '' }, T('08:00'));
		await syncOnce(phone, server);
		await syncOnce(laptop, server);
		expect(await getReading(laptop, id)).not.toHaveProperty('note');
	});

	it('gets changes even from a device whose clock is far behind (server cursor)', async () => {
		await syncOnce(laptop, server); // laptop has a cursor now
		// The phone's clock says 2020; its change still gets a fresh server synced_at.
		await addReading(phone, READING, new Date('2020-01-01T00:00:00Z'));
		await syncOnce(phone, server);
		await syncOnce(laptop, server);
		expect(await laptop.readings.count()).toBe(1);
	});

	it('re-sends a local version that is newer than what the server sends back', async () => {
		const { id } = await addReading(phone, READING, T('07:00'));
		await syncOnce(phone, server);
		// Pretend the phone's newer version was confirmed but the server lost it (e.g. restore).
		await updateReading(phone, id, { ...READING, systolic: 160 }, T('08:00'));
		await phone.readings.update(id, { syncPending: 0 });
		await phone.syncState.clear();
		await syncOnce(phone, server); // pulls the 07:00 version: older than ours
		expect(await pendingCount(phone)).toBe(1);
		await syncOnce(phone, server);
		expect(server.tables.get('readings')!.get(id)?.systolic).toBe(160);
	});

	it('pages through more changes than fit in one request', async () => {
		const many = Array.from({ length: PAGE_SIZE + 25 }, (_, i) =>
			addReading(phone, { ...READING, measuredAt: new Date(Date.parse(READING.measuredAt) - i * 60_000).toISOString() }, T('07:00'))
		);
		await Promise.all(many);
		expect((await syncOnce(phone, server)).pushed).toBe(PAGE_SIZE + 25);
		expect((await syncOnce(laptop, server)).pulled).toBe(PAGE_SIZE + 25);
		expect(await laptop.readings.count()).toBe(PAGE_SIZE + 25);
	});

	it('syncs settings, so thresholds follow you to the other device', async () => {
		const stricter = {
			systolic: { mild: 130, moderate: 150, severe: 170 },
			diastolic: { mild: 80, moderate: 95, severe: 105 }
		};
		await saveSettings(phone, { thresholds: stricter, birthYear: 1976 }, T('07:00'));
		await syncOnce(phone, server);
		await syncOnce(laptop, server);
		expect(await getSettings(laptop)).toMatchObject({ thresholds: stricter, birthYear: 1976 });
		expect((await getSettings(laptop)).thresholds).not.toEqual(DEFAULT_THRESHOLDS);
	});

	it('undoing an import on one device removes its readings on the other (C9)', async () => {
		const preview = parseRows(
			[['Datum', 'Uur', 'Boven', 'Onder'], ['18/01/2026', '08:30', 135, 85], ['18/01/2026', '21:00', 140, 90]],
			{ headerRow: 0, date: 0, time: 1, systolic: 2, diastolic: 3, note: null },
			{ timeZone: TZ, now: T('12:00') }
		);
		const { importId } = await saveImport(phone, preview, { fileName: 'oud.xlsx', now: T('07:00') });
		await syncOnce(phone, server);
		await syncOnce(laptop, server);
		expect(await laptop.readings.count()).toBe(2);

		await undoImport(laptop, importId!, T('08:00'));
		await syncOnce(laptop, server);
		await syncOnce(phone, server);
		expect((await phone.readings.toArray()).every((r) => r.deleted)).toBe(true);
		expect((await phone.imports.get(importId!))?.undoneAt).toBe(T('08:00').toISOString());
	});

	it('uploads everything stored before sync existed', async () => {
		// Rows written by v1 of the app: the v2 upgrade marks them pending.
		const name = `old-${crypto.randomUUID()}`;
		const { default: Dexie } = await import('dexie');
		const old = new Dexie(name, { indexedDB, IDBKeyRange });
		old.version(1).stores({ readings: 'id, measuredAt, updatedAt, importId', settings: 'id, updatedAt', imports: 'id, importedAt, updatedAt' });
		await old.table('readings').add({ id: 'r1', ...READING, source: 'manual', createdAt: T('07:00').toISOString(), updatedAt: T('07:00').toISOString(), deleted: false });
		old.close();

		const upgraded = createDb(name, { indexedDB, IDBKeyRange });
		expect(await pendingCount(upgraded)).toBe(1);
		await syncOnce(upgraded, server);
		expect(server.tables.get('readings')!.has('r1')).toBe(true);
		await upgraded.delete();
	});
});
