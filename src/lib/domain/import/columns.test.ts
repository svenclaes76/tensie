import { describe, expect, it } from 'vitest';
import type { Cell } from './cells';
import { detectColumns } from './columns';

describe('detectColumns', () => {
	it('finds the Bloeddruk.xlsx layout: header on row 2, Onder before Boven, untitled note column', () => {
		const rows: Cell[][] = [
			[],
			[null, 'Maand', 'Datum', 'Uur', 'Onder', 'Boven', null, null, null, null, null],
			[null, 'JULY', 45856, 0.354, 8.4, 13.7, null, null, null, null, 'normaal']
		];
		expect(detectColumns(rows)).toEqual({
			headerRow: 1,
			date: 2,
			time: 3,
			systolic: 5,
			diastolic: 4,
			note: 6
		});
	});

	it('treats a missing cell after the last column as the note column', () => {
		expect(detectColumns([['Datum', 'Uur', 'Onder', 'Boven']])?.note).toBe(4);
	});

	it('does not take a titled column as the note column', () => {
		expect(detectColumns([['Datum', 'Uur', 'Onder', 'Boven', 'Pols']])?.note).toBeNull();
	});

	it('prefers a column named as a note', () => {
		expect(detectColumns([['Datum', 'Uur', 'Boven', 'Onder', 'Pols', 'Opmerking']])?.note).toBe(5);
	});

	it('matches headers regardless of case, spacing and units', () => {
		expect(
			detectColumns([[' DATUM ', 'Tijd', 'Systolisch (mmHg)', 'Diastolisch (mmHg)']])
		).toMatchObject({ date: 0, time: 1, systolic: 2, diastolic: 3 });
		expect(detectColumns([['Date', 'Time', 'SYS', 'DIA']])).toMatchObject({
			date: 0,
			time: 1,
			systolic: 2,
			diastolic: 3
		});
	});

	it('allows date and time in one column', () => {
		expect(detectColumns([['Datum', 'Bovendruk', 'Onderdruk']])).toMatchObject({
			date: 0,
			time: null,
			systolic: 1,
			diastolic: 2
		});
	});

	it('returns null when a required column is missing', () => {
		expect(detectColumns([['Datum', 'Uur', 'Boven']])).toBeNull();
		expect(detectColumns([['Uur', 'Boven', 'Onder']])).toBeNull();
		expect(detectColumns([])).toBeNull();
	});

	it('only looks for headers in the first rows', () => {
		const rows: Cell[][] = [...Array.from({ length: 20 }, () => []), ['Datum', 'Boven', 'Onder']];
		expect(detectColumns(rows)).toBeNull();
		expect(detectColumns(rows, 21)?.headerRow).toBe(20);
	});
});
