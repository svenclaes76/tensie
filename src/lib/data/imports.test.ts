import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cell } from '../domain/import/cells';
import { parseRows, type ImportPreview } from '../domain/import/parse';
import { previewImport } from '../domain/import/spreadsheet';
import { createDb, type Reading, type TensieDb } from './db';
import { listImports, saveImport, undoImport } from './imports';

const TZ = 'Europe/Brussels';
const NOW = new Date('2026-10-25T12:00:00Z');
const LATER = new Date('2026-10-25T13:00:00Z');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let db: TensieDb;

beforeEach(() => {
	db = createDb(`test-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
});

afterEach(async () => {
	vi.restoreAllMocks();
	await db.delete();
});

/** Preview of Datum | Uur | Boven | Onder | Note rows, checked against what is stored now. */
async function preview(data: Cell[][]): Promise<ImportPreview> {
	return parseRows(
		[['Datum', 'Uur', 'Boven', 'Onder', null], ...data],
		{ headerRow: 0, date: 0, time: 1, systolic: 2, diastolic: 3, note: 4 },
		{ timeZone: TZ, now: NOW, existing: await db.readings.toArray() }
	);
}

function manual(measuredAt: string): Reading {
	return {
		id: crypto.randomUUID(),
		measuredAt,
		timeZone: TZ,
		systolic: 120,
		diastolic: 80,
		source: 'manual',
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
		deleted: false
	};
}

async function live(): Promise<Reading[]> {
	return (await db.readings.toArray()).filter((r) => !r.deleted);
}

describe('saveImport', () => {
	it('saves ready rows as imported readings and records the import', async () => {
		const result = await saveImport(
			db,
			await preview([
				['18/01/2026', '08:30', 13.5, 8.5, 'na koffie'],
				['18/01/2026', '21:00', 140, 90]
			]),
			{ fileName: 'Bloeddruk.xlsx', now: NOW }
		);
		expect(result).toEqual({
			importId: expect.stringMatching(UUID),
			saved: 2,
			skippedDuplicates: [],
			unconfirmed: []
		});

		const readings = await db.readings.orderBy('measuredAt').toArray();
		expect(readings).toEqual([
			{
				id: expect.stringMatching(UUID),
				measuredAt: '2026-01-18T07:30:00.000Z',
				timeZone: TZ,
				systolic: 135,
				diastolic: 85,
				note: 'na koffie',
				source: 'import',
				importId: result.importId,
				createdAt: NOW.toISOString(),
				updatedAt: NOW.toISOString(),
				deleted: false
			},
			expect.objectContaining({ measuredAt: '2026-01-18T20:00:00.000Z', systolic: 140 })
		]);
		expect(readings[0].id).not.toBe(readings[1].id);
		expect(readings[1]).not.toHaveProperty('note');

		expect(await db.imports.get(result.importId!)).toEqual({
			id: result.importId,
			fileName: 'Bloeddruk.xlsx',
			importedAt: NOW.toISOString(),
			readingCount: 2,
			updatedAt: NOW.toISOString(),
			deleted: false
		});
	});

	it('leaves flagged rows out unless the user confirmed them', async () => {
		const rows = await preview([
			['18/01/2026', '08:30', 135, 85],
			['05/08/2022', '08:30', 135, 85], // out of sequence
			['18/01/2027', '08:30', 135, 85] // future
		]);
		expect(rows.counts['needs-confirmation']).toBe(2);

		const result = await saveImport(db, rows, { fileName: 'a.xlsx', confirmedRows: [3], now: NOW });
		expect(result).toMatchObject({ saved: 2, unconfirmed: [4] });
		expect((await live()).map((r) => r.measuredAt).sort()).toEqual([
			'2022-08-05T06:30:00.000Z',
			'2026-01-18T07:30:00.000Z'
		]);
	});

	it('never saves rejected or duplicate rows, even when listed as confirmed', async () => {
		await db.readings.add(manual('2026-01-18T07:30:00.000Z'));
		const rows = await preview([
			['18/01/2026', '08:30', 135, 85], // duplicate of the stored reading
			['31/02/2026', '08:30', 135, 85] // rejected
		]);
		const result = await saveImport(db, rows, { fileName: 'a.xlsx', confirmedRows: [2, 3], now: NOW });
		expect(result).toEqual({ importId: null, saved: 0, skippedDuplicates: [], unconfirmed: [] });
		expect(await db.readings.count()).toBe(1);
	});

	it('checks duplicates again at save time, so a stale preview adds nothing twice', async () => {
		const rows = await preview([
			['18/01/2026', '08:30', 135, 85],
			['18/01/2026', '21:00', 135, 85]
		]);
		// Saved elsewhere (another tab, or by hand) after the preview was made.
		await db.readings.add(manual('2026-01-18T20:00:00.000Z'));

		const result = await saveImport(db, rows, { fileName: 'a.xlsx', now: NOW });
		expect(result).toMatchObject({ saved: 1, skippedDuplicates: [3] });
		expect(await db.readings.count()).toBe(2);
	});

	it('saves nothing and records no import when the same preview is saved twice', async () => {
		const rows = await preview([['18/01/2026', '08:30', 135, 85]]);
		await saveImport(db, rows, { fileName: 'a.xlsx', now: NOW });
		const second = await saveImport(db, rows, { fileName: 'a.xlsx', now: LATER });
		expect(second).toEqual({ importId: null, saved: 0, skippedDuplicates: [2], unconfirmed: [] });
		expect(await db.readings.count()).toBe(1);
		expect(await db.imports.count()).toBe(1);
	});

	it('treats a matching deleted reading as free', async () => {
		await db.readings.add({ ...manual('2026-01-18T07:30:00.000Z'), deleted: true });
		const rows = await preview([['18/01/2026', '08:30', 135, 85]]);
		expect((await saveImport(db, rows, { fileName: 'a.xlsx', now: NOW })).saved).toBe(1);
	});

	it('saves all or nothing: a failing import record rolls back the readings', async () => {
		const rows = await preview([['18/01/2026', '08:30', 135, 85]]);
		const first = await saveImport(db, await preview([['17/01/2026', '08:30', 135, 85]]), {
			fileName: 'a.xlsx',
			now: NOW
		});
		// Force the next import id to collide with the existing record, so its add fails.
		vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(
			() => first.importId as ReturnType<typeof crypto.randomUUID>
		);

		await expect(saveImport(db, rows, { fileName: 'b.xlsx', now: LATER })).rejects.toThrow();
		expect(await db.readings.count()).toBe(1);
		expect(await db.imports.count()).toBe(1);
	});
});

describe('undoImport', () => {
	it('soft-deletes every reading of that import and nothing else', async () => {
		await db.readings.add(manual('2026-01-10T07:30:00.000Z'));
		const other = await saveImport(db, await preview([['11/01/2026', '08:30', 135, 85]]), {
			fileName: 'other.xlsx',
			now: NOW
		});
		const target = await saveImport(
			db,
			await preview([
				['18/01/2026', '08:30', 135, 85],
				['18/01/2026', '21:00', 140, 90]
			]),
			{ fileName: 'target.xlsx', now: NOW }
		);

		expect(await undoImport(db, target.importId!, LATER)).toEqual({ removed: 2 });

		const undone = await db.readings.where('importId').equals(target.importId!).toArray();
		expect(undone).toHaveLength(2);
		for (const r of undone) expect(r).toMatchObject({ deleted: true, updatedAt: LATER.toISOString() });
		expect((await live()).map((r) => r.source + ' ' + (r.importId ?? ''))).toEqual(
			expect.arrayContaining(['manual ', `import ${other.importId}`])
		);
		expect(await live()).toHaveLength(2);

		expect(await db.imports.get(target.importId!)).toMatchObject({
			undoneAt: LATER.toISOString(),
			updatedAt: LATER.toISOString(),
			deleted: false
		});
	});

	it('also removes imported readings that were edited since', async () => {
		const { importId } = await saveImport(db, await preview([['18/01/2026', '08:30', 135, 85]]), {
			fileName: 'a.xlsx',
			now: NOW
		});
		const [reading] = await db.readings.toArray();
		await db.readings.update(reading.id, { systolic: 150, note: 'aangepast' });

		expect(await undoImport(db, importId!, LATER)).toEqual({ removed: 1 });
		expect(await live()).toEqual([]);
	});

	it('leaves readings that were already deleted untouched', async () => {
		const { importId } = await saveImport(
			db,
			await preview([
				['18/01/2026', '08:30', 135, 85],
				['18/01/2026', '21:00', 135, 85]
			]),
			{ fileName: 'a.xlsx', now: NOW }
		);
		const [first] = await db.readings.orderBy('measuredAt').toArray();
		const deletedAt = new Date('2026-10-25T12:30:00Z').toISOString();
		await db.readings.update(first.id, { deleted: true, updatedAt: deletedAt });

		expect(await undoImport(db, importId!, LATER)).toEqual({ removed: 1 });
		expect((await db.readings.get(first.id))?.updatedAt).toBe(deletedAt);
	});

	it('is harmless when run twice', async () => {
		const { importId } = await saveImport(db, await preview([['18/01/2026', '08:30', 135, 85]]), {
			fileName: 'a.xlsx',
			now: NOW
		});
		await undoImport(db, importId!, LATER);
		expect(await undoImport(db, importId!, new Date('2026-10-26T00:00:00Z'))).toEqual({ removed: 0 });
		expect((await db.imports.get(importId!))?.undoneAt).toBe(LATER.toISOString());
	});

	it('rejects an unknown import id', async () => {
		await expect(undoImport(db, 'no-such-import')).rejects.toThrow('Unknown import');
	});
});

describe('listImports', () => {
	it('lists imports newest first, including undone ones', async () => {
		const first = await saveImport(db, await preview([['17/01/2026', '08:30', 135, 85]]), {
			fileName: 'eerste.xlsx',
			now: NOW
		});
		await saveImport(db, await preview([['18/01/2026', '08:30', 135, 85]]), {
			fileName: 'tweede.xlsx',
			now: LATER
		});
		await undoImport(db, first.importId!, LATER);

		const list = await listImports(db);
		expect(list.map((i) => [i.fileName, i.undoneAt ?? null])).toEqual([
			['tweede.xlsx', null],
			['eerste.xlsx', LATER.toISOString()]
		]);
	});
});

describe('sample-import.xlsx end to end', () => {
	const file = readFileSync(resolve('tests/fixtures/sample-import.xlsx'));

	async function previewFixture(): Promise<ImportPreview> {
		const result = previewImport(file, {
			timeZone: TZ,
			now: NOW,
			existing: await db.readings.toArray()
		});
		if (!result.ok) throw new Error('fixture not recognised');
		return result.preview;
	}

	it('imports, blocks a re-import, undoes, and can import again', async () => {
		// First import: the two flagged rows (23 and 43) are confirmed.
		const first = await saveImport(db, await previewFixture(), {
			fileName: 'sample-import.xlsx',
			confirmedRows: [23, 43],
			now: NOW
		});
		expect(first).toMatchObject({ saved: 96, skippedDuplicates: [], unconfirmed: [] });

		// Re-importing the same file finds only duplicates and saves nothing.
		const again = await previewFixture();
		expect(again.counts.duplicate).toBe(96);
		expect((await saveImport(db, again, { fileName: 'sample-import.xlsx', now: LATER })).saved).toBe(0);

		// Undo removes the whole import.
		expect(await undoImport(db, first.importId!, LATER)).toEqual({ removed: 96 });
		expect(await live()).toEqual([]);

		// After undo the file previews as new again.
		const afterUndo = await previewFixture();
		expect(afterUndo.counts).toEqual({ ready: 94, 'needs-confirmation': 2, duplicate: 0, rejected: 0 });
		const second = await saveImport(db, afterUndo, { fileName: 'sample-import.xlsx', now: LATER });
		expect(second).toMatchObject({ saved: 94, unconfirmed: [23, 43] });
		expect(await live()).toHaveLength(94);
	});
});
