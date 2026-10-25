import { describe, expect, it } from 'vitest';
import {
	excelSerialToParts,
	isEmptyCell,
	parseDateCell,
	parseNumberCell,
	parseTimeCell,
	parseTimeText
} from './cells';

describe('isEmptyCell', () => {
	it.each([null, '', '   '])('%j is empty', (cell) => expect(isEmptyCell(cell)).toBe(true));
	it.each([0, '0', 'x', false])('%j is not empty', (cell) => expect(isEmptyCell(cell)).toBe(false));
});

describe('parseNumberCell', () => {
	it.each([
		[9.8, 9.8],
		[16, 16],
		[0, 0],
		['9.8', 9.8],
		['9,8', 9.8],
		['16.0', 16],
		[' 135 ', 135]
	] as const)('%j → %d', (cell, expected) => {
		expect(parseNumberCell(cell)).toBe(expected);
	});

	it.each(['', 'abc', '9.8.1', '-9.8', '9 8', '1e2', true, null, -1, Number.NaN, Infinity])(
		'rejects %j',
		(cell) => {
			expect(parseNumberCell(cell)).toBeNull();
		}
	);
});

describe('excelSerialToParts', () => {
	it('reads the fixture dates (1900 system)', () => {
		expect(excelSerialToParts(45856)).toEqual({ date: '2025-07-18', minutes: 0 });
		expect(excelSerialToParts(44778)).toEqual({ date: '2022-08-05', minutes: 0 });
		expect(excelSerialToParts(46993)).toEqual({ date: '2028-08-28', minutes: 0 });
	});

	it('crosses the 1900 leap-year bug correctly: serial 61 is 1 March 1900', () => {
		expect(excelSerialToParts(61)?.date).toBe('1900-03-01');
	});

	it('reads the 1904 system', () => {
		expect(excelSerialToParts(0 + 1, true)?.date).toBe('1904-01-02');
		expect(excelSerialToParts(45856 - 1462, true)?.date).toBe('2025-07-18');
	});

	it('reads the time fraction and drops seconds', () => {
		expect(excelSerialToParts(45856.3541666666666667)).toEqual({ date: '2025-07-18', minutes: 510 });
		expect(excelSerialToParts(45856 + 0.875)?.minutes).toBe(21 * 60);
		// 08:30:45 → 08:30
		expect(excelSerialToParts(45856 + (8 * 3600 + 30 * 60 + 45) / 86400)?.minutes).toBe(510);
		expect(excelSerialToParts(45856 + 1439 / 1440)?.minutes).toBe(1439);
	});

	it('rejects serials below 1 and non-finite values', () => {
		expect(excelSerialToParts(0.5)).toBeNull();
		expect(excelSerialToParts(Number.NaN)).toBeNull();
	});
});

describe('parseTimeText', () => {
	it.each([
		['08:30', 510],
		['8:30', 510],
		['8u30', 510],
		['8h30', 510],
		['08.30', 510],
		['08:30:59', 510],
		['00:00', 0],
		['23:59', 1439]
	] as const)('%j → %i', (text, minutes) => {
		expect(parseTimeText(text)).toBe(minutes);
	});

	it.each(['24:00', '12:60', '8', '830', '8:3', 'acht uur', ''])('rejects %j', (text) => {
		expect(parseTimeText(text)).toBeNull();
	});
});

describe('parseTimeCell', () => {
	it('reads Excel time fractions', () => {
		expect(parseTimeCell(0.3541666666666667)).toBe(510);
		expect(parseTimeCell(0.875)).toBe(1260);
		expect(parseTimeCell(0)).toBe(0);
		expect(parseTimeCell(1439 / 1440)).toBe(1439);
	});

	it('reads time text', () => {
		expect(parseTimeCell('21:00')).toBe(1260);
	});

	it('rejects numbers of 1 or more, negatives and other types', () => {
		expect(parseTimeCell(1)).toBeNull();
		expect(parseTimeCell(8.5)).toBeNull();
		expect(parseTimeCell(-0.1)).toBeNull();
		expect(parseTimeCell(true)).toBeNull();
		expect(parseTimeCell(null)).toBeNull();
	});
});

describe('parseDateCell', () => {
	it('reads an Excel date cell without time', () => {
		expect(parseDateCell(45856)).toEqual({ date: '2025-07-18', minutes: null });
	});

	it('reads an Excel date cell with time', () => {
		expect(parseDateCell(45856.875)).toEqual({ date: '2025-07-18', minutes: 1260 });
	});

	it('reads Belgian dd/mm/yyyy dates, never as US dates', () => {
		expect(parseDateCell('05/08/2025')).toEqual({ date: '2025-08-05', minutes: null });
		expect(parseDateCell('5/8/2025')).toEqual({ date: '2025-08-05', minutes: null });
		expect(parseDateCell('18-07-2025')).toEqual({ date: '2025-07-18', minutes: null });
		expect(parseDateCell('18.07.2025')).toEqual({ date: '2025-07-18', minutes: null });
		expect(parseDateCell('18/07/25')).toEqual({ date: '2025-07-18', minutes: null });
	});

	it('reads ISO dates', () => {
		expect(parseDateCell('2025-07-18')).toEqual({ date: '2025-07-18', minutes: null });
	});

	it('reads date and time in one cell', () => {
		expect(parseDateCell('18/07/2025 08:30')).toEqual({ date: '2025-07-18', minutes: 510 });
		expect(parseDateCell('2025-07-18T21:00')).toEqual({ date: '2025-07-18', minutes: 1260 });
	});

	it.each(['31/02/2025', '29/02/2025', '00/01/2025', '18/13/2025', '18/07/2025 25:00', 'gisteren', ''])(
		'rejects %j',
		(cell) => {
			expect(parseDateCell(cell)).toBeNull();
		}
	);

	it('accepts 29 February in a leap year', () => {
		expect(parseDateCell('29/02/2028')?.date).toBe('2028-02-29');
	});

	it('rejects booleans and null', () => {
		expect(parseDateCell(true)).toBeNull();
		expect(parseDateCell(null)).toBeNull();
	});
});
