import { describe, expect, it } from 'vitest';
import type { Cell } from '#lib/domain/import/cells.js';
import { columnOptions, emptyDraft, toMapping, type MappingDraft } from './mapping';

const DRAFT: MappingDraft = {
	headerRow: 1,
	date: 2,
	time: 3,
	systolic: 5,
	diastolic: 4,
	note: 6
};

describe('toMapping', () => {
	it('accepts a complete draft', () => {
		expect(toMapping(DRAFT)).toEqual(DRAFT);
	});

	it('allows time and note to be left out', () => {
		expect(toMapping({ ...DRAFT, time: null, note: null })).toMatchObject({ time: null, note: null });
	});

	it.each(['date', 'systolic', 'diastolic'] as const)('requires %s', (field) => {
		expect(toMapping({ ...DRAFT, [field]: null })).toBeNull();
	});

	it('rejects two fields on the same column', () => {
		expect(toMapping({ ...DRAFT, diastolic: 5 })).toBeNull();
		expect(toMapping({ ...DRAFT, note: 2 })).toBeNull();
	});
});

describe('emptyDraft', () => {
	it('puts the titles on the first filled row', () => {
		expect(emptyDraft([[], [null, ''], [null, 'x']])).toMatchObject({ headerRow: 2, date: null });
	});

	it('falls back to the first row for an empty sheet', () => {
		expect(emptyDraft([]).headerRow).toBe(0);
	});
});

describe('columnOptions', () => {
	it('lists filled columns with letter and title, untitled ones marked', () => {
		const rows: Cell[][] = [
			[],
			[null, 'Maand', 'Datum', null, null, null, null],
			[null, null, 45856, null, null, null, 'Start medicatie']
		];
		expect(columnOptions(rows, 1)).toEqual([
			{ index: 1, label: 'B · Maand' },
			{ index: 2, label: 'C · Datum' },
			{ index: 6, label: 'G · (zonder titel)' }
		]);
	});
});
