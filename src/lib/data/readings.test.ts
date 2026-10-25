import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DAY_PART_WINDOWS } from '../domain/dayPart';
import { DEFAULT_THRESHOLDS } from '../domain/thresholds';
import { createDb, type TensieDb } from './db';
import { addReading, deleteReading, getReading, restoreReading, updateReading } from './readings';
import { getSettings } from './settings';

const NOW = new Date('2026-10-25T09:58:30Z');
let db: TensieDb;

beforeEach(() => {
	db = createDb(`test-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
});

afterEach(async () => {
	await db.delete();
});

describe('addReading', () => {
	it('stores a manual reading with sync fields', async () => {
		const reading = await addReading(
			db,
			{
				measuredAt: '2026-10-25T09:58:00.000Z',
				timeZone: 'Europe/Brussels',
				systolic: 146,
				diastolic: 88,
				arm: 'left',
				note: '  na koffie '
			},
			NOW
		);
		expect(reading).toEqual({
			id: expect.stringMatching(/^[0-9a-f-]{36}$/),
			measuredAt: '2026-10-25T09:58:00.000Z',
			timeZone: 'Europe/Brussels',
			systolic: 146,
			diastolic: 88,
			arm: 'left',
			note: 'na koffie',
			source: 'manual',
			createdAt: NOW.toISOString(),
			updatedAt: NOW.toISOString(),
			deleted: false
		});
		expect(await db.readings.get(reading.id)).toEqual(reading);
	});

	it('leaves out an empty arm and note', async () => {
		const reading = await addReading(
			db,
			{ measuredAt: NOW.toISOString(), timeZone: 'UTC', systolic: 120, diastolic: 80, note: '   ' },
			NOW
		);
		expect(reading).not.toHaveProperty('arm');
		expect(reading).not.toHaveProperty('note');
	});

	it('stores implausible values: the screen has already asked for confirmation (C4)', async () => {
		const reading = await addReading(
			db,
			{ measuredAt: NOW.toISOString(), timeZone: 'UTC', systolic: 280, diastolic: 290 },
			NOW
		);
		expect(reading).toMatchObject({ systolic: 280, diastolic: 290 });
	});

	it.each([
		[{ systolic: 146.5, diastolic: 88 }],
		[{ systolic: 0, diastolic: 88 }],
		[{ systolic: 146, diastolic: -1 }],
		[{ systolic: Number.NaN, diastolic: 88 }]
	])('refuses malformed values %j', async (values) => {
		await expect(
			addReading(db, { measuredAt: NOW.toISOString(), timeZone: 'UTC', ...values }, NOW)
		).rejects.toThrow(RangeError);
		expect(await db.readings.count()).toBe(0);
	});

	it('refuses an invalid time', async () => {
		await expect(
			addReading(db, { measuredAt: 'gisteren', timeZone: 'UTC', systolic: 120, diastolic: 80 }, NOW)
		).rejects.toThrow(RangeError);
	});
});

describe('getSettings', () => {
	it('falls back to the default thresholds and windows (T3, T5)', async () => {
		const settings = await getSettings(db);
		expect(settings.thresholds).toEqual(DEFAULT_THRESHOLDS);
		expect(settings.dayPartWindows).toEqual(DEFAULT_DAY_PART_WINDOWS);
		expect(settings.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
	});

	it('uses stored settings once they exist', async () => {
		const thresholds = {
			systolic: { mild: 130, moderate: 150, severe: 170 },
			diastolic: { mild: 80, moderate: 95, severe: 105 }
		};
		await db.settings.add({
			id: 's',
			timeZone: 'Europe/Lisbon',
			thresholds,
			dayPartWindows: DEFAULT_DAY_PART_WINDOWS,
			updatedAt: NOW.toISOString(),
			deleted: false
		});
		expect(await getSettings(db)).toMatchObject({ timeZone: 'Europe/Lisbon', thresholds });
	});
});

describe('editing and deleting (C7)', () => {
	const LATER = new Date('2026-10-25T10:30:00Z');
	const INPUT = {
		measuredAt: '2026-10-25T08:58:00.000Z',
		timeZone: 'Europe/Brussels',
		systolic: 146,
		diastolic: 88,
		arm: 'left' as const,
		note: 'na koffie'
	};

	it('updates the edited fields and updatedAt, keeping id, source and createdAt', async () => {
		const original = await addReading(db, INPUT, NOW);
		const changed = await updateReading(db, original.id, { ...INPUT, systolic: 150 }, LATER);
		expect(changed).toBe(true);
		expect(await db.readings.get(original.id)).toEqual({
			...original,
			systolic: 150,
			updatedAt: LATER.toISOString()
		});
	});

	it('removes a cleared arm and note', async () => {
		const original = await addReading(db, INPUT, NOW);
		await updateReading(db, original.id, { ...INPUT, arm: undefined, note: '  ' }, LATER);
		const stored = await db.readings.get(original.id);
		expect(stored).not.toHaveProperty('arm');
		expect(stored).not.toHaveProperty('note');
	});

	it('writes nothing when nothing changed', async () => {
		const original = await addReading(db, INPUT, NOW);
		expect(await updateReading(db, original.id, { ...INPUT, note: ' na koffie ' }, LATER)).toBe(false);
		expect((await db.readings.get(original.id))?.updatedAt).toBe(NOW.toISOString());
	});

	it('keeps an imported reading’s source and import id', async () => {
		await db.readings.add({
			id: 'imp',
			...INPUT,
			source: 'import',
			importId: 'import-1',
			createdAt: NOW.toISOString(),
			updatedAt: NOW.toISOString(),
			deleted: false
		});
		await updateReading(db, 'imp', { ...INPUT, diastolic: 90 }, LATER);
		expect(await db.readings.get('imp')).toMatchObject({
			source: 'import',
			importId: 'import-1',
			diastolic: 90
		});
	});

	it('refuses malformed values and unknown or deleted readings', async () => {
		const original = await addReading(db, INPUT, NOW);
		await expect(updateReading(db, original.id, { ...INPUT, systolic: 0 }, LATER)).rejects.toThrow(
			RangeError
		);
		await expect(updateReading(db, 'nope', INPUT, LATER)).rejects.toThrow('Unknown reading');
		await deleteReading(db, original.id, LATER);
		await expect(updateReading(db, original.id, INPUT, LATER)).rejects.toThrow('Unknown reading');
	});

	it('deletes softly and restores', async () => {
		const original = await addReading(db, INPUT, NOW);
		await deleteReading(db, original.id, LATER);
		expect(await db.readings.get(original.id)).toMatchObject({
			deleted: true,
			updatedAt: LATER.toISOString()
		});
		expect(await getReading(db, original.id)).toBeUndefined();

		const restoredAt = new Date('2026-10-25T10:30:05Z');
		await restoreReading(db, original.id, restoredAt);
		expect(await getReading(db, original.id)).toMatchObject({
			deleted: false,
			updatedAt: restoredAt.toISOString(),
			systolic: 146
		});
	});

	it('refuses to delete an unknown or already deleted reading', async () => {
		const original = await addReading(db, INPUT, NOW);
		await expect(deleteReading(db, 'nope', LATER)).rejects.toThrow('Unknown reading');
		await deleteReading(db, original.id, LATER);
		await expect(deleteReading(db, original.id, LATER)).rejects.toThrow('Unknown reading');
	});

	it('leaves a live reading untouched when restoring it', async () => {
		const original = await addReading(db, INPUT, NOW);
		await restoreReading(db, original.id, LATER);
		expect((await db.readings.get(original.id))?.updatedAt).toBe(NOW.toISOString());
	});
});
