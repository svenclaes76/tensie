import { describe, expect, it } from 'vitest';
import { DEFAULT_DAY_PART_WINDOWS } from './domain/dayPart';
import { DEFAULT_THRESHOLDS } from './domain/thresholds';
import type { ReadingLike } from './domain/types';
import { buildHome } from './home';

const OPTIONS = { thresholds: DEFAULT_THRESHOLDS, windows: DEFAULT_DAY_PART_WINDOWS, today: '2026-10-25' };

function reading(local: string, systolic: number, diastolic: number, extra: Partial<ReadingLike> = {}): ReadingLike {
	return { measuredAt: new Date(local).toISOString(), timeZone: 'Europe/Brussels', systolic, diastolic, ...extra };
}

describe('buildHome (H7)', () => {
	it('has nothing to show without readings', () => {
		const home = buildHome([], OPTIONS);
		expect(home.last).toBeNull();
		expect(home.week.count).toBe(0);
		expect(home.trend).toEqual({ kind: 'none' });
	});

	it('shows the newest reading with its categories, time and day part', () => {
		const home = buildHome(
			[
				reading('2026-10-24T21:15:00+02:00', 150, 92),
				reading('2026-10-25T07:42:00+01:00', 138, 86),
				reading('2026-10-25T09:00:00+01:00', 200, 120, { deleted: true })
			],
			OPTIONS
		);
		expect(home.last).toEqual({
			systolic: 138,
			diastolic: 86,
			classification: { systolic: 'mild', diastolic: 'mild', overall: 'mild' },
			when: 'zo 25 okt · 07:42',
			dayPart: 'morning'
		});
	});

	it('adds the year to an old last reading', () => {
		const home = buildHome([reading('2025-10-10T21:00:00+02:00', 143, 96)], OPTIONS);
		expect(home.last?.when).toBe('vr 10 okt 2025 · 21:00');
		expect(home.last?.dayPart).toBe('evening');
	});

	it('averages the last 7 days, today included, with morning and evening apart', () => {
		const home = buildHome(
			[
				reading('2026-10-25T07:42:00+01:00', 140, 90), // today
				reading('2026-10-19T21:00:00+02:00', 150, 94), // 6 days ago: in
				reading('2026-10-18T07:30:00+02:00', 200, 120) // 7 days ago: out
			],
			OPTIONS
		);
		expect(home.week).toMatchObject({ count: 2, systolic: 145, diastolic: 92 });
		expect(home.week.classification).toEqual({ systolic: 'mild', diastolic: 'mild', overall: 'mild' });
		expect(home.morning).toMatchObject({ count: 1, systolic: 140 });
		expect(home.evening).toMatchObject({ count: 1, systolic: 150 });
	});

	describe('trend versus the 7 days before', () => {
		const lastWeek = [
			reading('2026-10-18T07:30:00+02:00', 148, 93),
			reading('2026-10-12T07:30:00+02:00', 148, 93)
		];

		it.each([
			[145, 91, { kind: 'lower', systolic: 3, diastolic: 2 }],
			[151, 95, { kind: 'higher', systolic: 3, diastolic: 2 }],
			[145, 93, { kind: 'lower', systolic: 3, diastolic: 0 }],
			[148, 95, { kind: 'higher', systolic: 0, diastolic: 2 }],
			[145, 95, { kind: 'mixed', systolic: -3, diastolic: 2 }],
			[148, 93, { kind: 'same' }]
		] as const)('%i/%i this week → %j', (systolic, diastolic, trend) => {
			const home = buildHome([reading('2026-10-24T07:30:00+02:00', systolic, diastolic), ...lastWeek], OPTIONS);
			expect(home.trend).toEqual(trend);
		});

		it('has no trend when either week has no readings', () => {
			expect(buildHome(lastWeek, OPTIONS).trend).toEqual({ kind: 'none' });
			expect(buildHome([reading('2026-10-24T07:30:00+02:00', 140, 90)], OPTIONS).trend).toEqual({
				kind: 'none'
			});
		});

		it('ignores readings older than two weeks', () => {
			const home = buildHome(
				[reading('2026-10-24T07:30:00+02:00', 140, 90), reading('2026-10-11T07:30:00+02:00', 180, 110)],
				OPTIONS
			);
			expect(home.trend).toEqual({ kind: 'none' });
		});
	});
});
