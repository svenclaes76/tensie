import { describe, expect, it } from 'vitest';
import { dayPartAverages, MIN_READINGS_PER_MONTH, monthlyAverages, summarize } from './averages';
import { DEFAULT_THRESHOLDS } from './thresholds';
import type { ReadingLike, Thresholds } from './types';

/** A reading at a Brussels wall-clock time (dates in January/February are UTC+1). */
function reading(
	local: string,
	systolic: number,
	diastolic: number,
	extra: Partial<ReadingLike> = {}
): ReadingLike {
	return {
		measuredAt: new Date(`${local}:00+01:00`).toISOString(),
		timeZone: 'Europe/Brussels',
		systolic,
		diastolic,
		...extra
	};
}

/** `count` readings on consecutive January days at 08:00. */
function january(count: number, systolic = 120, diastolic = 80): ReadingLike[] {
	return Array.from({ length: count }, (_, i) =>
		reading(`2026-01-${String(i + 1).padStart(2, '0')}T08:00`, systolic, diastolic)
	);
}

describe('summarize', () => {
	it('returns an empty summary when there are no readings', () => {
		expect(summarize([], DEFAULT_THRESHOLDS)).toEqual({
			count: 0,
			systolic: null,
			diastolic: null,
			classification: null
		});
	});

	it('averages every reading', () => {
		const result = summarize(
			[
				reading('2026-01-01T08:00', 120, 80),
				reading('2026-01-01T13:00', 130, 90),
				reading('2026-01-01T20:00', 140, 70)
			],
			DEFAULT_THRESHOLDS
		);
		expect(result).toMatchObject({ count: 3, systolic: 130, diastolic: 80 });
	});

	it.each([
		[[120, 121], 121], // 120.5 rounds up
		[[120, 120, 121], 120], // 120.33 rounds down
		[[120, 121, 121], 121] // 120.67 rounds up
	])('rounds %j to %i', (values, expected) => {
		const readings = values.map((s) => reading('2026-01-01T08:00', s, 80));
		expect(summarize(readings, DEFAULT_THRESHOLDS).systolic).toBe(expected);
	});

	it('classifies the rounded systolic mean: 134.5 shows as 135 and is licht verhoogd', () => {
		const result = summarize(
			[reading('2026-01-01T08:00', 134, 80), reading('2026-01-02T08:00', 135, 80)],
			DEFAULT_THRESHOLDS
		);
		expect(result.systolic).toBe(135);
		expect(result.classification?.systolic).toBe('licht verhoogd');
	});

	it('keeps a mean that rounds down below the limit normaal: 134.33 shows as 134', () => {
		const result = summarize(
			[
				reading('2026-01-01T08:00', 134, 80),
				reading('2026-01-02T08:00', 134, 80),
				reading('2026-01-03T08:00', 135, 80)
			],
			DEFAULT_THRESHOLDS
		);
		expect(result.systolic).toBe(134);
		expect(result.classification?.systolic).toBe('normaal');
	});

	it('classifies the rounded diastolic mean: 84.5 shows as 85 and is licht verhoogd', () => {
		const result = summarize(
			[reading('2026-01-01T08:00', 120, 84), reading('2026-01-02T08:00', 120, 85)],
			DEFAULT_THRESHOLDS
		);
		expect(result.diastolic).toBe(85);
		expect(result.classification).toEqual({
			systolic: 'normaal',
			diastolic: 'licht verhoogd',
			overall: 'licht verhoogd'
		});
	});

	it('ignores deleted readings', () => {
		const result = summarize(
			[reading('2026-01-01T08:00', 120, 80), reading('2026-01-02T08:00', 200, 120, { deleted: true })],
			DEFAULT_THRESHOLDS
		);
		expect(result).toMatchObject({ count: 1, systolic: 120, diastolic: 80 });
	});

	it('returns an empty summary when every reading is deleted', () => {
		const result = summarize(
			[reading('2026-01-01T08:00', 120, 80, { deleted: true })],
			DEFAULT_THRESHOLDS
		);
		expect(result.count).toBe(0);
	});
});

describe('monthlyAverages (H3, T6)', () => {
	it('requires 6 readings per month', () => {
		expect(MIN_READINGS_PER_MONTH).toBe(6);
	});

	it('marks a month with 5 readings as limited data', () => {
		const [month] = monthlyAverages(january(5), DEFAULT_THRESHOLDS);
		expect(month).toMatchObject({ month: '2026-01', count: 5, limitedData: true });
	});

	it('does not mark a month with 6 readings as limited data', () => {
		const [month] = monthlyAverages(january(6), DEFAULT_THRESHOLDS);
		expect(month).toMatchObject({ month: '2026-01', count: 6, limitedData: false });
	});

	it('does not count deleted readings towards the minimum', () => {
		const readings = [...january(5), reading('2026-01-20T08:00', 120, 80, { deleted: true })];
		const [month] = monthlyAverages(readings, DEFAULT_THRESHOLDS);
		expect(month).toMatchObject({ count: 5, limitedData: true });
	});

	it('uses every reading in the month, whatever the time of day', () => {
		const readings = [
			reading('2026-01-01T08:00', 120, 80), // ochtend
			reading('2026-01-01T14:00', 150, 95), // andere
			reading('2026-01-01T21:00', 180, 110) // avond
		];
		const [month] = monthlyAverages(readings, DEFAULT_THRESHOLDS);
		expect(month).toMatchObject({ count: 3, systolic: 150, diastolic: 95 });
	});

	it('returns months oldest first and skips months without readings', () => {
		const readings = [
			reading('2026-03-10T08:00', 140, 90),
			reading('2026-01-10T08:00', 120, 80),
			reading('2026-03-11T08:00', 150, 90)
		];
		const result = monthlyAverages(readings, DEFAULT_THRESHOLDS);
		expect(result.map((m) => [m.month, m.count])).toEqual([
			['2026-01', 1],
			['2026-03', 2]
		]);
	});

	it('assigns a reading to its local month', () => {
		// 00:30 on 1 February in Brussels is 31 January in UTC.
		const result = monthlyAverages([reading('2026-02-01T00:30', 120, 80)], DEFAULT_THRESHOLDS);
		expect(result.map((m) => m.month)).toEqual(['2026-02']);
	});

	it('classifies each monthly average and reclassifies it when thresholds change (T4)', () => {
		const readings = january(6, 140, 88);
		const stricter: Thresholds = {
			systolic: { licht: 125, gemiddeld: 140, ernstig: 170 },
			diastolic: { licht: 80, gemiddeld: 95, ernstig: 105 }
		};
		expect(monthlyAverages(readings, DEFAULT_THRESHOLDS)[0].classification?.overall).toBe(
			'licht verhoogd'
		);
		expect(monthlyAverages(readings, stricter)[0].classification?.overall).toBe(
			'gemiddeld verhoogd'
		);
	});

	it('returns nothing when there are no readings', () => {
		expect(monthlyAverages([], DEFAULT_THRESHOLDS)).toEqual([]);
	});
});

describe('dayPartAverages (H3)', () => {
	const readings = [
		reading('2026-01-01T03:59', 100, 60), // andere
		reading('2026-01-01T04:00', 120, 80), // ochtend
		reading('2026-01-01T11:59', 130, 84), // ochtend
		reading('2026-01-01T12:00', 110, 70), // andere
		reading('2026-01-01T18:00', 150, 96), // avond
		reading('2026-01-01T23:59', 160, 100) // avond
	];

	it('averages morning, evening and other readings separately', () => {
		const result = dayPartAverages(readings, DEFAULT_THRESHOLDS);
		expect(result.ochtend).toMatchObject({ count: 2, systolic: 125, diastolic: 82 });
		expect(result.avond).toMatchObject({ count: 2, systolic: 155, diastolic: 98 });
		expect(result.andere).toMatchObject({ count: 2, systolic: 105, diastolic: 65 });
	});

	it('classifies each day-part average', () => {
		const result = dayPartAverages(readings, DEFAULT_THRESHOLDS);
		expect(result.ochtend.classification?.overall).toBe('normaal');
		expect(result.avond.classification?.overall).toBe('licht verhoogd');
	});

	it('returns an empty summary for a day part without readings', () => {
		const result = dayPartAverages([reading('2026-01-01T08:00', 120, 80)], DEFAULT_THRESHOLDS);
		expect(result.avond.count).toBe(0);
		expect(result.andere.count).toBe(0);
	});

	it('uses custom windows', () => {
		const result = dayPartAverages(readings, DEFAULT_THRESHOLDS, {
			ochtend: { start: '03:00', end: '04:00' },
			avond: { start: '12:00', end: '18:00' }
		});
		expect(result.ochtend.count).toBe(2);
		expect(result.avond.count).toBe(2);
		expect(result.andere.count).toBe(2);
	});
});
