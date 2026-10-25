import { describe, expect, it } from 'vitest';
import { DEFAULT_DAY_PART_WINDOWS } from './domain/dayPart';
import { DEFAULT_THRESHOLDS } from './domain/thresholds';
import { buildList, type ListFilter, type ListReading } from './list';

const OPTIONS = { thresholds: DEFAULT_THRESHOLDS, windows: DEFAULT_DAY_PART_WINDOWS };
let nextId = 0;

/** A reading at a Brussels wall-clock time, given with its offset. */
function reading(local: string, systolic: number, diastolic: number, extra: Partial<ListReading> = {}): ListReading {
	return {
		id: `r${nextId++}`,
		measuredAt: new Date(local).toISOString(),
		timeZone: 'Europe/Brussels',
		systolic,
		diastolic,
		...extra
	};
}

const READINGS = [
	reading('2026-10-24T21:15:00+02:00', 150, 92, { note: 'hoofdpijn' }),
	reading('2026-10-25T07:42:00+01:00', 138, 86),
	reading('2026-09-30T07:35:00+02:00', 120, 80),
	reading('2026-10-24T07:40:00+02:00', 182, 101),
	reading('2026-10-25T13:10:00+01:00', 128, 82)
];

function list(filter: ListFilter = 'all', readings = READINGS) {
	return buildList(readings, { ...OPTIONS, filter });
}

describe('buildList (H1)', () => {
	it('groups by month, newest month first, readings newest first', () => {
		const groups = list();
		expect(groups.map((g) => g.label)).toEqual(['Oktober 2026', 'September 2026']);
		expect(groups[0].rows.map((r) => r.time)).toEqual(['13:10', '07:42', '21:15', '07:40']);
	});

	it('shows the day label only on the first reading of a day', () => {
		expect(list()[0].rows.map((r) => r.dayLabel)).toEqual(['zo 25/10', null, 'za 24/10', null]);
		expect(list()[0].rows.map((r) => r.day)).toEqual(['zo 25/10', 'zo 25/10', 'za 24/10', 'za 24/10']);
	});

	it('starts each month with its own day label, even when the day repeats a month earlier', () => {
		expect(list()[1].rows[0].dayLabel).toBe('wo 30/09');
	});

	it('classifies systolic and diastolic separately with the current thresholds', () => {
		const rows = list()[0].rows;
		expect(rows.find((r) => r.time === '07:40')).toMatchObject({
			systolicCategory: 'severe',
			diastolicCategory: 'moderate'
		});
		expect(rows.find((r) => r.time === '13:10')).toMatchObject({
			systolicCategory: 'normal',
			diastolicCategory: 'normal'
		});
	});

	it('reclassifies when thresholds change (T4)', () => {
		const stricter = {
			systolic: { mild: 120, moderate: 130, severe: 140 },
			diastolic: { mild: 80, moderate: 85, severe: 90 }
		};
		const [october] = buildList(READINGS, { ...OPTIONS, thresholds: stricter, filter: 'all' });
		expect(october.rows.find((r) => r.time === '13:10')).toMatchObject({
			systolicCategory: 'mild',
			diastolicCategory: 'mild'
		});
	});

	it('marks readings with a note', () => {
		const rows = list()[0].rows;
		expect(rows.filter((r) => r.hasNote).map((r) => r.time)).toEqual(['21:15']);
	});

	it('ignores a note of only spaces', () => {
		const [group] = list('all', [reading('2026-10-25T07:42:00+01:00', 138, 86, { note: '  ' })]);
		expect(group.rows[0].hasNote).toBe(false);
	});

	it('summarises each month with the average and count of all its readings', () => {
		const [october, september] = list();
		// (138 + 128 + 150 + 182) / 4 = 149.5 → 150; (86 + 82 + 92 + 101) / 4 = 90.25 → 90
		expect(october.summary).toMatchObject({ count: 4, systolic: 150, diastolic: 90 });
		expect(september.summary).toMatchObject({ count: 1, systolic: 120, diastolic: 80 });
	});

	it('filters on morning readings and summarises only those', () => {
		const groups = list('morning');
		expect(groups.map((g) => g.rows.map((r) => r.time))).toEqual([['07:42', '07:40'], ['07:35']]);
		expect(groups[0].summary).toMatchObject({ count: 2, systolic: 160, diastolic: 94 });
	});

	it('filters on evening readings and drops months without any', () => {
		const groups = list('evening');
		expect(groups.map((g) => g.label)).toEqual(['Oktober 2026']);
		expect(groups[0].rows.map((r) => r.time)).toEqual(['21:15']);
		expect(groups[0].rows[0].dayLabel).toBe('za 24/10');
	});

	it('leaves out deleted readings', () => {
		const withDeleted = [...READINGS, reading('2026-10-25T08:00:00+01:00', 200, 120, { deleted: true })];
		expect(list('all', withDeleted)[0].summary.count).toBe(4);
	});

	it('uses each reading’s own time zone for its day, time and month', () => {
		// 00:30 on 1 November in Brussels is still 31 October in UTC.
		const [group] = list('all', [
			{ ...reading('2026-11-01T00:30:00+01:00', 130, 80), timeZone: 'Europe/Brussels' }
		]);
		expect(group).toMatchObject({ month: '2026-11', label: 'November 2026' });
		expect(group.rows[0]).toMatchObject({ dayLabel: 'zo 01/11', time: '00:30' });
	});

	it('returns nothing when there are no readings', () => {
		expect(list('all', [])).toEqual([]);
	});
});
