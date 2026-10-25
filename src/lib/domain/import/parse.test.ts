import { describe, expect, it } from 'vitest';
import type { ReadingLike } from '../types';
import type { Cell } from './cells';
import type { ColumnMapping } from './columns';
import { CMHG_BELOW, parseRows, type ImportOptions, type ParsedRow } from './parse';

// Header on row 1: Datum | Uur | Boven | Onder | (note)
const MAPPING: ColumnMapping = { headerRow: 0, date: 0, time: 1, systolic: 2, diastolic: 3, note: 4 };
const HEADER: Cell[] = ['Datum', 'Uur', 'Boven', 'Onder', null];
const OPTIONS: ImportOptions = {
	timeZone: 'Europe/Brussels',
	now: new Date('2026-10-25T12:00:00Z')
};

function parse(data: Cell[][], options: Partial<ImportOptions> = {}, mapping = MAPPING) {
	return parseRows([HEADER, ...data], mapping, { ...OPTIONS, ...options });
}

function only(data: Cell[][], options: Partial<ImportOptions> = {}): ParsedRow {
	const { rows } = parse(data, options);
	expect(rows).toHaveLength(1);
	return rows[0];
}

describe('parseRows — values and units', () => {
	it('reads a mmHg row into a reading draft', () => {
		expect(only([['18/01/2026', '08:30', 135, 85]])).toEqual({
			rowNumber: 2,
			status: 'ready',
			unit: 'mmHg',
			flags: [],
			reading: {
				measuredAt: '2026-01-18T07:30:00.000Z',
				timeZone: 'Europe/Brussels',
				systolic: 135,
				diastolic: 85
			}
		});
	});

	it('converts cmHg to mmHg and rounds away floating-point noise (9.8 → 98)', () => {
		const row = only([['18/01/2026', '08:30', 16.0, 9.8]]);
		expect(row).toMatchObject({ unit: 'cmHg', reading: { systolic: 160, diastolic: 98 } });
	});

	it('reads numbers stored as text, with a decimal point or comma', () => {
		expect(only([['18/01/2026', '08:30', '15.7', '9,7']])).toMatchObject({
			unit: 'cmHg',
			reading: { systolic: 157, diastolic: 97 }
		});
	});

	it(`takes values below ${CMHG_BELOW} as cmHg and ${CMHG_BELOW} or more as mmHg`, () => {
		expect(only([['18/01/2026', '08:30', 29.9, 29.9]], {})).toMatchObject({ unit: 'cmHg' });
		expect(only([['18/01/2026', '08:30', 30, 30]], {})).toMatchObject({ unit: 'mmHg' });
	});

	it('rejects a row where one value looks like cmHg and the other like mmHg', () => {
		expect(only([['18/01/2026', '08:30', 160, 9.8]])).toEqual({
			rowNumber: 2,
			status: 'rejected',
			reason: 'unclear-unit'
		});
	});

	it('uses a fixed unit when one is given', () => {
		expect(only([['18/01/2026', '08:30', 160, 9.8]], { unit: 'mmHg' })).toMatchObject({
			unit: 'mmHg',
			reading: { systolic: 160, diastolic: 10 }
		});
		expect(only([['18/01/2026', '08:30', 16, 9.8]], { unit: 'cmHg' })).toMatchObject({
			reading: { systolic: 160, diastolic: 98 }
		});
	});

	it('rounds mmHg values with decimals to whole numbers', () => {
		expect(only([['18/01/2026', '08:30', 135.5, 84.4]])).toMatchObject({
			reading: { systolic: 136, diastolic: 84 }
		});
	});

	it('imports the note, trimmed, and leaves it out when empty', () => {
		expect(only([['18/01/2026', '08:30', 135, 85, '  Start medicatie ']])).toMatchObject({
			reading: { note: 'Start medicatie' }
		});
		const row = only([['18/01/2026', '08:30', 135, 85, '   ']]);
		expect(row.status !== 'rejected' && 'note' in row.reading).toBe(false);
	});

	it('ignores the note column when the mapping has none', () => {
		const { rows } = parse([['18/01/2026', '08:30', 135, 85, 'x']], {}, { ...MAPPING, note: null });
		expect(rows[0].status !== 'rejected' && rows[0].reading.note).toBeUndefined();
	});
});

describe('parseRows — dates and times', () => {
	it('reads Excel date and time cells', () => {
		expect(only([[45856, 0.3541666666666667, 13.7, 8.4]])).toMatchObject({
			reading: { measuredAt: '2025-07-18T06:30:00.000Z' } // 08:30 CEST
		});
	});

	it('reads date and time from one column', () => {
		const mapping: ColumnMapping = { headerRow: 0, date: 0, time: null, systolic: 1, diastolic: 2, note: null };
		const { rows } = parseRows(
			[['Datum', 'Boven', 'Onder'], ['18/01/2026 21:00', 135, 85], [45856.875, 135, 85]],
			mapping,
			OPTIONS
		);
		expect(rows.map((r) => r.status !== 'rejected' && r.reading.measuredAt)).toEqual([
			'2026-01-18T20:00:00.000Z',
			'2025-07-18T19:00:00.000Z'
		]);
	});

	it('takes a whole Excel date in a combined column as midnight, but rejects text without time', () => {
		const mapping: ColumnMapping = { headerRow: 0, date: 0, time: null, systolic: 1, diastolic: 2, note: null };
		const { rows } = parseRows(
			[['Datum', 'Boven', 'Onder'], [45856, 135, 85], ['18/07/2025', 135, 85]],
			mapping,
			OPTIONS
		);
		expect(rows[0]).toMatchObject({ reading: { measuredAt: '2025-07-17T22:00:00.000Z' } });
		expect(rows[1]).toMatchObject({ status: 'rejected', reason: 'missing-time' });
	});

	it('uses the time zone given for the file', () => {
		expect(only([['18/01/2026', '08:30', 135, 85]], { timeZone: 'UTC' })).toMatchObject({
			reading: { measuredAt: '2026-01-18T08:30:00.000Z', timeZone: 'UTC' }
		});
	});

	it('reads the 1904 date system when told to', () => {
		expect(only([[45856 - 1462, '08:30', 135, 85]], { date1904: true })).toMatchObject({
			reading: { measuredAt: '2025-07-18T06:30:00.000Z' }
		});
	});
});

describe('parseRows — rejected rows', () => {
	it.each([
		[[null, '08:30', 135, 85], 'missing-date'],
		[['31/02/2026', '08:30', 135, 85], 'invalid-date'],
		[['18/01/2026', null, 135, 85], 'missing-time'],
		[['18/01/2026', '25:00', 135, 85], 'invalid-time'],
		[['18/01/2026', '08:30', null, 85], 'missing-value'],
		[['18/01/2026', '08:30', 135, ''], 'missing-value'],
		[['18/01/2026', '08:30', 'hoog', 85], 'invalid-value'],
		[['18/01/2026', '08:30', 135, true], 'invalid-value']
	] as [Cell[], string][])('%j is rejected as %s', (row, reason) => {
		expect(only([row])).toEqual({ rowNumber: 2, status: 'rejected', reason });
	});

	it('skips rows without date, time or values, even when other columns have text', () => {
		const { rows } = parse([
			[null, null, null, null, 'losse opmerking'],
			[],
			['18/01/2026', '08:30', 135, 85]
		]);
		expect(rows.map((r) => r.rowNumber)).toEqual([4]);
	});
});

describe('parseRows — confirmation flags', () => {
	it('flags implausible values (C4) instead of rejecting them', () => {
		expect(only([['18/01/2026', '08:30', 270, 85]])).toMatchObject({
			status: 'needs-confirmation',
			flags: ['systolic-out-of-range']
		});
		expect(only([['18/01/2026', '08:30', 85, 85]])).toMatchObject({
			status: 'needs-confirmation',
			flags: ['systolic-not-above-diastolic']
		});
	});

	it('flags a reading after now as future', () => {
		const { rows } = parse(
			[
				['25/10/2026', '12:59', 135, 85], // 11:59 UTC on 25 Oct (CET): before now
				['25/10/2026', '13:01', 135, 85] // 12:01 UTC: after now
			],
			{ now: new Date('2026-10-25T12:00:00Z') }
		);
		expect(rows.map((r) => r.status)).toEqual(['ready', 'needs-confirmation']);
		expect(rows[1]).toMatchObject({ flags: ['future'] });
	});

	it('flags only the row whose date goes back, not the rows after it', () => {
		const { rows } = parse([
			['01/08/2025', '08:30', 135, 85],
			['03/08/2025', '08:30', 135, 85],
			['05/08/2022', '08:30', 135, 85],
			['05/08/2025', '08:30', 135, 85]
		]);
		expect(rows.map((r) => r.status)).toEqual(['ready', 'ready', 'needs-confirmation', 'ready']);
		expect(rows[2]).toMatchObject({ flags: ['out-of-sequence'] });
	});

	it('does not let a future row flag the rows after it', () => {
		const { rows } = parse([
			['25/08/2025', '08:30', 135, 85],
			['28/08/2028', '08:30', 135, 85],
			['28/08/2025', '21:00', 135, 85]
		]);
		expect(rows.map((r) => (r.status === 'rejected' ? r.reason : r.flags))).toEqual([
			[],
			['future'],
			[]
		]);
	});

	it('accepts the same date again and an earlier time on the same date', () => {
		const { rows } = parse([
			['03/08/2025', '21:00', 135, 85],
			['03/08/2025', '08:30', 135, 85],
			['04/08/2025', '08:30', 135, 85]
		]);
		expect(rows.every((r) => r.status === 'ready')).toBe(true);
	});

	it('checks the sequence the other way in a file sorted newest first', () => {
		const { rows } = parse([
			['10/08/2025', '08:30', 135, 85],
			['09/08/2025', '08:30', 135, 85],
			['12/08/2025', '08:30', 135, 85],
			['08/08/2025', '08:30', 135, 85]
		]);
		expect(rows.map((r) => r.status)).toEqual([
			'ready',
			'ready',
			'needs-confirmation',
			'ready'
		]);
	});

	it('combines flags', () => {
		expect(only([['18/01/2027', '08:30', 300, 85]])).toMatchObject({
			flags: ['systolic-out-of-range', 'future']
		});
	});
});

describe('parseRows — duplicates', () => {
	const existing: ReadingLike[] = [
		{ measuredAt: '2026-01-18T07:30:00.000Z', timeZone: 'Europe/Brussels', systolic: 120, diastolic: 80 }
	];

	it('marks a row with the same local date and time as a stored reading as duplicate', () => {
		expect(only([['18/01/2026', '08:30', 135, 85]], { existing })).toMatchObject({
			status: 'duplicate',
			flags: []
		});
	});

	it('does not match a different minute', () => {
		expect(only([['18/01/2026', '08:31', 135, 85]], { existing }).status).toBe('ready');
	});

	it('ignores deleted stored readings', () => {
		const deleted = [{ ...existing[0], deleted: true }];
		expect(only([['18/01/2026', '08:30', 135, 85]], { existing: deleted }).status).toBe('ready');
	});

	it("matches a stored reading on its own local time, whatever its time zone", () => {
		// 08:30 in Lisbon (UTC+0 in January) is 09:30 in Brussels.
		const lisbon: ReadingLike[] = [
			{ measuredAt: '2026-01-18T08:30:00.000Z', timeZone: 'Europe/Lisbon', systolic: 120, diastolic: 80 }
		];
		expect(only([['18/01/2026', '08:30', 135, 85]], { existing: lisbon }).status).toBe('duplicate');
	});

	it('marks the second of two identical date-times in one file as duplicate', () => {
		const { rows, counts } = parse([
			['18/01/2026', '08:30', 135, 85],
			['18/01/2026', '08:30', 140, 90]
		]);
		expect(rows.map((r) => r.status)).toEqual(['ready', 'duplicate']);
		expect(counts).toEqual({ ready: 1, 'needs-confirmation': 0, duplicate: 1, rejected: 0 });
	});

	it('does not flag a duplicate for date problems', () => {
		const old = [{ ...existing[0], measuredAt: '2022-08-05T06:30:00.000Z' }];
		const { rows } = parse(
			[
				['01/08/2025', '08:30', 135, 85],
				['05/08/2022', '08:30', 135, 85]
			],
			{ existing: old }
		);
		expect(rows[1]).toMatchObject({ status: 'duplicate', flags: [] });
	});
});

describe('parseRows — rows and counts', () => {
	it('keeps sheet order and 1-based row numbers, and counts every status', () => {
		const { rows, counts } = parseRows(
			[
				[],
				[null, 'Datum', 'Uur', 'Boven', 'Onder'],
				[null, '18/01/2026', '08:30', 135, 85],
				[null, null, '08:30', 135, 85],
				[null, '19/01/2026', '08:30', 300, 85],
				[null, '18/01/2026', '08:30', 135, 85]
			],
			{ headerRow: 1, date: 1, time: 2, systolic: 3, diastolic: 4, note: null },
			OPTIONS
		);
		expect(rows.map((r) => [r.rowNumber, r.status])).toEqual([
			[3, 'ready'],
			[4, 'rejected'],
			[5, 'needs-confirmation'],
			[6, 'duplicate']
		]);
		expect(counts).toEqual({ ready: 1, 'needs-confirmation': 1, duplicate: 1, rejected: 1 });
	});
});
