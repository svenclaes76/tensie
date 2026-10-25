import { describe, expect, it } from 'vitest';
import {
	ALL_DOTS_UP_TO_DAYS,
	buildChart,
	periodRange,
	rangeDays,
	READINGS_UP_TO_DAYS,
	type DateRange
} from './chart';
import { DEFAULT_THRESHOLDS } from './domain/thresholds';
import type { ReadingLike } from './domain/types';

const TZ = 'Europe/Brussels';

function reading(local: string, systolic: number, diastolic: number, extra: Partial<ReadingLike> = {}): ReadingLike {
	return { measuredAt: new Date(local).toISOString(), timeZone: TZ, systolic, diastolic, ...extra };
}

function chart(readings: ReadingLike[], range: DateRange, series: 'systolic' | 'diastolic' = 'systolic') {
	return buildChart(readings, { series, range, thresholds: DEFAULT_THRESHOLDS, timeZone: TZ });
}

describe('periodRange', () => {
	it.each([
		['7d', '2026-10-19'],
		['30d', '2026-09-26'],
		['90d', '2026-07-28'],
		['1y', '2025-10-26']
	] as const)('%s ends today and starts on %s', (period, start) => {
		expect(periodRange(period, '2026-10-25')).toEqual({ start, end: '2026-10-25' });
	});

	it('keeps a custom range, putting it in order', () => {
		expect(periodRange('custom', '2026-10-25', { start: '2026-01-01', end: '2026-02-01' })).toEqual({
			start: '2026-01-01',
			end: '2026-02-01'
		});
		expect(periodRange('custom', '2026-10-25', { start: '2026-02-01', end: '2026-01-01' })).toEqual({
			start: '2026-01-01',
			end: '2026-02-01'
		});
	});
});

describe('rangeDays', () => {
	it('counts both ends, across daylight saving', () => {
		expect(rangeDays({ start: '2026-10-19', end: '2026-10-25' })).toBe(7);
		expect(rangeDays({ start: '2026-10-25', end: '2026-10-25' })).toBe(1);
		expect(rangeDays({ start: '2026-03-01', end: '2026-03-31' })).toBe(31);
	});
});

describe('buildChart', () => {
	const WEEK = { start: '2026-10-19', end: '2026-10-25' };
	const READINGS = [
		reading('2026-10-25T07:42:00+01:00', 138, 86),
		reading('2026-10-19T07:30:00+02:00', 128, 80),
		reading('2026-10-22T21:00:00+02:00', 182, 104),
		reading('2026-10-18T21:00:00+02:00', 150, 95), // the day before the range
		reading('2026-10-23T08:00:00+02:00', 200, 120, { deleted: true })
	];

	it('takes the readings in the range, oldest first, skipping deleted ones', () => {
		const data = chart(READINGS, WEEK);
		expect(data.points.map((p) => p.label)).toEqual(['ma 19/10 07:30', 'do 22/10 21:00', 'zo 25/10 07:42']);
		expect(data.points.map((p) => p.value)).toEqual([128, 182, 138]);
		expect(data.granularity).toBe('reading');
	});

	it('classifies each point for the chosen series (H5)', () => {
		expect(chart(READINGS, WEEK).points.map((p) => p.category)).toEqual(['normal', 'severe', 'mild']);
		expect(chart(READINGS, WEEK, 'diastolic').points.map((p) => p.category)).toEqual([
			'normal',
			'moderate',
			'mild'
		]);
	});

	it('places points on a time axis from the start of the first day to the end of the last', () => {
		const data = chart(READINGS, WEEK);
		expect(new Date(data.xMin).toISOString()).toBe('2026-10-18T22:00:00.000Z');
		expect(new Date(data.xMax).toISOString()).toBe('2026-10-25T23:00:00.000Z');
		expect(data.points[0].t).toBe(Date.parse('2026-10-19T05:30:00Z'));
	});

	it('keeps every category band in view and never clips a value', () => {
		const data = chart(READINGS, WEEK);
		expect([data.yMin, data.yMax]).toEqual([110, 200]);
		const high = chart([reading('2026-10-20T08:00:00+02:00', 243, 150)], WEEK);
		expect(high.yMax).toBe(250);
		const low = chart([reading('2026-10-20T08:00:00+02:00', 92, 58)], WEEK, 'diastolic');
		expect([low.yMin, low.yMax]).toEqual([50, 130]);
	});

	it('summarises the range: average of both values, highest and lowest of the series', () => {
		const data = chart(READINGS, WEEK);
		expect(data.summary).toMatchObject({ count: 3, systolic: 149, diastolic: 90 });
		expect(data.highest).toEqual({ systolic: 182, diastolic: 104 });
		expect(data.lowest).toEqual({ systolic: 128, diastolic: 80 });
		const byDiastolic = chart(
			[reading('2026-10-20T08:00:00+02:00', 150, 80), reading('2026-10-21T08:00:00+02:00', 140, 95)],
			WEEK,
			'diastolic'
		);
		expect(byDiastolic.highest).toEqual({ systolic: 140, diastolic: 95 });
	});

	it('is empty but still scaled when there are no readings', () => {
		const data = chart([], WEEK);
		expect(data.points).toEqual([]);
		expect(data.summary.count).toBe(0);
		expect(data.highest).toBeNull();
		expect([data.yMin, data.yMax]).toEqual([110, 200]);
	});

	it(`draws a dot on every reading up to ${ALL_DOTS_UP_TO_DAYS} days`, () => {
		const range = { start: '2026-09-25', end: '2026-10-25' };
		expect(rangeDays(range)).toBe(ALL_DOTS_UP_TO_DAYS);
		expect(chart(READINGS, range).points.every((p) => p.dot)).toBe(true);
	});

	it('beyond that, only dots on raised (moderate, severe) readings', () => {
		const range = { start: '2026-09-24', end: '2026-10-25' };
		expect(chart(READINGS, range).points.map((p) => [p.value, p.dot])).toEqual([
			[150, false],
			[128, false],
			[182, true],
			[138, false]
		]);
	});

	it(`shows every reading up to ${READINGS_UP_TO_DAYS} days, weekly averages beyond`, () => {
		const upTo = { start: '2026-06-28', end: '2026-10-25' };
		expect(rangeDays(upTo)).toBe(READINGS_UP_TO_DAYS);
		expect(chart(READINGS, upTo).granularity).toBe('reading');
		expect(chart(READINGS, { ...upTo, start: '2026-06-27' }).granularity).toBe('week');
	});

	it('averages readings per Monday-to-Sunday week, placed mid-week', () => {
		const year = { start: '2025-10-26', end: '2026-10-25' };
		const data = chart(
			[
				reading('2026-10-19T07:30:00+02:00', 130, 80), // Monday
				reading('2026-10-25T07:42:00+01:00', 141, 86), // Sunday, same week
				reading('2026-10-18T21:00:00+02:00', 182, 104) // Sunday, week before
			],
			year
		);
		expect(data.granularity).toBe('week');
		expect(data.points.map((p) => [p.label, p.value, p.count, p.category, p.dot])).toEqual([
			['week van ma 12/10', 182, 1, 'severe', true],
			['week van ma 19/10', 136, 2, 'mild', false]
		]);
		expect(new Date(data.points[1].t).toISOString()).toBe('2026-10-22T10:00:00.000Z');
		// The stats still come from the individual readings.
		expect(data.highest).toEqual({ systolic: 182, diastolic: 104 });
	});

	it('counts a reading by its own local date', () => {
		// 00:30 on 19 October in Brussels is still 18 October in UTC.
		const data = chart([reading('2026-10-19T00:30:00+02:00', 130, 80)], WEEK);
		expect(data.points).toHaveLength(1);
	});
});
