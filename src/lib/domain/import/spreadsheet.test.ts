import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { getDayPart } from '../dayPart';
import type { ReadingLike } from '../types';
import type { ParsedRow } from './parse';
import { previewImport, readSpreadsheet } from './spreadsheet';

const FIXTURE = readFileSync(resolve('tests/fixtures/sample-import.xlsx'));
const OPTIONS = { timeZone: 'Europe/Brussels', now: new Date('2026-10-25T12:00:00Z') };

function workbook(rows: unknown[][], date1904 = false): Uint8Array {
	const wb = utils.book_new();
	utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), 'Blad1');
	if (date1904) wb.Workbook = { WBProps: { date1904: true } };
	return write(wb, { type: 'array', bookType: 'xlsx' });
}

function csv(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

function readings(rows: ParsedRow[]) {
	return rows.flatMap((r) => (r.status === 'rejected' ? [] : [r.reading]));
}

describe('previewImport — sample-import.xlsx (Bloeddruk.xlsx layout)', () => {
	const result = previewImport(FIXTURE, OPTIONS);
	if (!result.ok) throw new Error('fixture not recognised');
	const { rows, counts } = result.preview;
	const byRow = (n: number) => rows.find((r) => r.rowNumber === n)!;

	it('reads Blad1 with the header on row 2 and Onder before Boven', () => {
		expect(result.sheet).toBe('Blad1');
		expect(result.mapping).toEqual({
			headerRow: 1,
			date: 2, // C Datum
			time: 3, // D Uur
			systolic: 5, // F Boven
			diastolic: 4, // E Onder
			note: 6 // G, untitled
		});
	});

	it('finds 96 readings: 94 ready, 2 to confirm, none rejected or duplicate', () => {
		expect(rows).toHaveLength(96);
		expect(counts).toEqual({ ready: 94, 'needs-confirmation': 2, duplicate: 0, rejected: 0 });
	});

	it('converts cmHg to mmHg (row 3: Onder 8.4, Boven 13.7 → 137/84)', () => {
		expect(byRow(3)).toMatchObject({
			status: 'ready',
			unit: 'cmHg',
			reading: { measuredAt: '2025-07-18T06:30:00.000Z', systolic: 137, diastolic: 84 }
		});
		expect(rows.every((r) => r.status !== 'rejected' && r.unit === 'cmHg')).toBe(true);
	});

	it('reads the values stored as text in the last 6 rows', () => {
		expect(readings(rows.slice(-6)).map((r) => [r.systolic, r.diastolic])).toEqual([
			[157, 97],
			[157, 79],
			[162, 87],
			[139, 97],
			[149, 82],
			[143, 96]
		]);
	});

	it('imports the note on row 6 and ignores the threshold legend in K–M', () => {
		expect(byRow(6)).toMatchObject({ reading: { note: 'Start medicatie' } });
		const withNotes = readings(rows).filter((r) => r.note !== undefined);
		expect(withNotes).toHaveLength(1);
	});

	it('flags row 23 (2022, out of sequence) and row 43 (2028, future) for confirmation', () => {
		expect(byRow(23)).toMatchObject({
			status: 'needs-confirmation',
			flags: ['out-of-sequence'],
			reading: { measuredAt: '2022-08-05T06:30:00.000Z' }
		});
		expect(byRow(43)).toMatchObject({ status: 'needs-confirmation', flags: ['future'] });
		expect(byRow(24).status).toBe('ready');
		expect(byRow(44).status).toBe('ready');
	});

	it('puts every reading in the morning or evening slot (08:30 and 21:00 local)', () => {
		const parts = readings(rows).map((r) => getDayPart(r.measuredAt, r.timeZone));
		expect(new Set(parts)).toEqual(new Set(['ochtend', 'avond']));
	});

	it('creates no duplicates when the same file is imported again', () => {
		const stored: ReadingLike[] = readings(rows);
		const again = previewImport(FIXTURE, { ...OPTIONS, existing: stored });
		expect(again.ok && again.preview.counts).toEqual({
			ready: 0,
			'needs-confirmation': 0,
			duplicate: 96,
			rejected: 0
		});
	});

	it('ignores Blad2', () => {
		expect(readSpreadsheet(FIXTURE).map((s) => s.name)).toEqual(['Blad1', 'Blad2']);
		expect(result.sheet).toBe('Blad1');
	});
});

describe('readSpreadsheet', () => {
	it('keeps row indexes aligned with Excel rows even when the sheet starts lower', () => {
		const [sheet] = readSpreadsheet(FIXTURE);
		expect(sheet.rows[1].slice(1, 6)).toEqual(['Maand', 'Datum', 'Uur', 'Onder', 'Boven']);
		expect(sheet.rows[0].every((cell) => cell === null)).toBe(true);
	});

	it('reports the 1904 date system', () => {
		const data = workbook([['Datum', 'Uur', 'Boven', 'Onder'], [44394, 0.5, 135, 85]], true);
		expect(readSpreadsheet(data)[0].date1904).toBe(true);
		const result = previewImport(data, OPTIONS);
		// 44394 in the 1904 system is 18 July 2025.
		expect(result.ok && readings(result.preview.rows)[0].measuredAt).toBe('2025-07-18T10:00:00.000Z');
	});
});

describe('previewImport — other files (C9)', () => {
	it('reads a CSV with semicolons, Belgian dates and decimal commas', () => {
		const result = previewImport(
			csv('Datum;Uur;Boven;Onder;Opmerking\n18/07/2025;08:30;13,7;8,4;na koffie\n05/08/2025;21:00;135;85;\n'),
			OPTIONS
		);
		expect(result.ok && result.preview.rows).toMatchObject([
			{
				status: 'ready',
				reading: { measuredAt: '2025-07-18T06:30:00.000Z', systolic: 137, diastolic: 84, note: 'na koffie' }
			},
			{ status: 'ready', reading: { measuredAt: '2025-08-05T19:00:00.000Z', systolic: 135, diastolic: 85 } }
		]);
	});

	it('never reads a CSV date as a US date', () => {
		const result = previewImport(csv('Datum,Uur,Boven,Onder\n05/08/2025,08:30,135,85\n'), OPTIONS);
		expect(result.ok && readings(result.preview.rows)[0].measuredAt).toBe('2025-08-05T06:30:00.000Z');
	});

	it('reads date and time from one Excel cell', () => {
		const result = previewImport(workbook([['Datum', 'Systolisch', 'Diastolisch'], [45856.875, 135, 85]]), OPTIONS);
		expect(result.ok && result.mapping.time).toBeNull();
		expect(result.ok && readings(result.preview.rows)[0].measuredAt).toBe('2025-07-18T19:00:00.000Z');
	});

	it('returns the sheets for manual mapping when no headers are recognised', () => {
		const data = workbook([['Wanneer', 'Hoog', 'Laag'], ['18/07/2025 08:30', 135, 85]]);
		const result = previewImport(data, OPTIONS);
		expect(result).toMatchObject({ ok: false, reason: 'no-columns-detected' });
		expect(!result.ok && result.sheets[0].rows[1]).toEqual(['18/07/2025 08:30', 135, 85]);
	});

	it('uses a mapping chosen by the user', () => {
		const data = workbook([['Wanneer', 'Hoog', 'Laag'], ['18/07/2025 08:30', 135, 85]]);
		const result = previewImport(data, {
			...OPTIONS,
			sheet: 'Blad1',
			mapping: { headerRow: 0, date: 0, time: null, systolic: 1, diastolic: 2, note: null }
		});
		expect(result.ok && readings(result.preview.rows)).toEqual([
			{ measuredAt: '2025-07-18T06:30:00.000Z', timeZone: 'Europe/Brussels', systolic: 135, diastolic: 85 }
		]);
	});
});
