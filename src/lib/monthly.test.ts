import { describe, expect, it } from 'vitest';
import { DEFAULT_DAY_PART_WINDOWS } from './domain/dayPart';
import { DEFAULT_THRESHOLDS } from './domain/thresholds';
import type { ReadingLike } from './domain/types';
import { buildMonthly } from './monthly';

const OPTIONS = {
	thresholds: DEFAULT_THRESHOLDS,
	windows: DEFAULT_DAY_PART_WINDOWS,
	currentMonth: '2026-10'
};

function reading(local: string, systolic: number, diastolic: number, extra: Partial<ReadingLike> = {}): ReadingLike {
	return { measuredAt: new Date(local).toISOString(), timeZone: 'Europe/Brussels', systolic, diastolic, ...extra };
}

/** `count` readings in September 2026, alternating 07:30 and 21:00. */
function september(count: number): ReadingLike[] {
	return Array.from({ length: count }, (_, i) => {
		const day = String(Math.floor(i / 2) + 1).padStart(2, '0');
		return i % 2 === 0
			? reading(`2026-09-${day}T07:30:00+02:00`, 140, 90)
			: reading(`2026-09-${day}T21:00:00+02:00`, 150, 94);
	});
}

describe('buildMonthly (H3, T6)', () => {
	it('lists months newest first and marks the current one as running', () => {
		const cards = buildMonthly(
			[...september(6), reading('2026-10-25T07:42:00+01:00', 138, 86), reading('2026-07-03T08:00:00+02:00', 130, 80)],
			OPTIONS
		);
		expect(cards.map((c) => c.label)).toEqual(['Oktober 2026 (lopend)', 'September 2026', 'Juli 2026']);
	});

	it('averages every reading in the month and classifies the averages', () => {
		const [card] = buildMonthly(september(6), OPTIONS);
		expect(card.summary).toEqual({
			count: 6,
			systolic: 145,
			diastolic: 92,
			classification: { systolic: 'mild', diastolic: 'mild', overall: 'mild' }
		});
	});

	it('marks months with fewer than 6 readings as limited data', () => {
		expect(buildMonthly(september(5), OPTIONS)[0].limitedData).toBe(true);
		expect(buildMonthly(september(6), OPTIONS)[0].limitedData).toBe(false);
	});

	it('splits morning and evening averages', () => {
		const [card] = buildMonthly(
			[...september(6), reading('2026-09-20T14:00:00+02:00', 200, 120)],
			OPTIONS
		);
		expect(card.morning).toMatchObject({ count: 3, systolic: 140, diastolic: 90 });
		expect(card.evening).toMatchObject({ count: 3, systolic: 150, diastolic: 94 });
		// The afternoon reading counts in the month, not in morning or evening.
		expect(card.summary.count).toBe(7);
	});

	it('shows an empty morning or evening when there were none', () => {
		const [card] = buildMonthly([reading('2026-09-01T07:30:00+02:00', 140, 90)], OPTIONS);
		expect(card.evening.count).toBe(0);
	});

	it('leaves out deleted readings, also from the count', () => {
		const cards = buildMonthly(
			[...september(6), reading('2026-09-28T07:30:00+02:00', 220, 130, { deleted: true })],
			OPTIONS
		);
		expect(cards[0].summary.count).toBe(6);
	});

	it('reclassifies when thresholds change (T4)', () => {
		const stricter = {
			systolic: { mild: 125, moderate: 140, severe: 170 },
			diastolic: { mild: 80, moderate: 90, severe: 105 }
		};
		const [card] = buildMonthly(september(6), { ...OPTIONS, thresholds: stricter });
		expect(card.summary.classification).toEqual({
			systolic: 'moderate',
			diastolic: 'moderate',
			overall: 'moderate'
		});
	});

	it('puts a reading in its local month', () => {
		// 00:30 on 1 November in Brussels is 31 October in UTC.
		const cards = buildMonthly([reading('2026-11-01T00:30:00+01:00', 130, 80)], {
			...OPTIONS,
			currentMonth: '2026-11'
		});
		expect(cards[0].label).toBe('November 2026 (lopend)');
	});

	it('returns nothing without readings', () => {
		expect(buildMonthly([], OPTIONS)).toEqual([]);
	});
});
