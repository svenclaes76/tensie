import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DAY_PART_WINDOWS } from '../domain/dayPart';
import { DEFAULT_THRESHOLDS } from '../domain/thresholds';
import { createDb, type TensieDb } from './db';
import { addReading } from './readings';
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
				arm: 'links',
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
			arm: 'links',
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
			systolic: { licht: 130, gemiddeld: 150, ernstig: 170 },
			diastolic: { licht: 80, gemiddeld: 95, ernstig: 105 }
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
