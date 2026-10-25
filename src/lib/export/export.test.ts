import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type TensieDb } from '../data/db';
import { saveImport } from '../data/imports';
import { addReading, deleteReading } from '../data/readings';
import { saveSettings } from '../data/settings';
import { DEFAULT_DAY_PART_WINDOWS } from '../domain/dayPart';
import { previewImport } from '../domain/import/spreadsheet';
import { DEFAULT_THRESHOLDS } from '../domain/thresholds';
import { buildReport } from '../report';
import { buildFullExport } from './json';
import { buildCsv, exportRows, type ExportReading } from './rows';
import { buildWorkbook } from './workbook';

const TZ = 'Europe/Brussels';

function reading(local: string, systolic: number, diastolic: number, extra: Partial<ExportReading> = {}): ExportReading {
	return { measuredAt: new Date(local).toISOString(), timeZone: TZ, systolic, diastolic, ...extra };
}

const READINGS: ExportReading[] = [
	reading('2026-10-25T07:42:00+01:00', 138, 86, { arm: 'left' }),
	reading('2025-07-18T08:30:00+02:00', 137, 84, { note: 'Start medicatie' }),
	reading('2026-03-02T21:00:00+01:00', 150, 92, { note: 'na "zware" dag; moe', arm: 'right' }),
	reading('2026-03-03T08:00:00+01:00', 200, 120, { deleted: true })
];

describe('exportRows (E2)', () => {
	it('lists live readings oldest first, in their own local date and time', () => {
		expect(exportRows(READINGS)).toEqual([
			{ isoDate: '2025-07-18', minutes: 510, systolic: 137, diastolic: 84, note: 'Start medicatie', arm: '' },
			{ isoDate: '2026-03-02', minutes: 1260, systolic: 150, diastolic: 92, note: 'na "zware" dag; moe', arm: 'rechts' },
			{ isoDate: '2026-10-25', minutes: 462, systolic: 138, diastolic: 86, note: '', arm: 'links' }
		]);
	});
});

describe('buildCsv (E2)', () => {
	it('writes Belgian CSV: semicolons, dd/mm/yyyy, BOM, quoted fields where needed', () => {
		expect(buildCsv(READINGS)).toBe(
			'﻿Datum;Uur;Boven;Onder;Notitie;Arm\r\n' +
				'18/07/2025;08:30;137;84;Start medicatie;\r\n' +
				'02/03/2026;21:00;150;92;"na ""zware"" dag; moe";rechts\r\n' +
				'25/10/2026;07:42;138;86;;links\r\n'
		);
	});

	it('reads straight back in with the importer', () => {
		const result = previewImport(new TextEncoder().encode(buildCsv(READINGS)), {
			timeZone: TZ,
			now: new Date('2026-10-25T12:00:00Z')
		});
		if (!result.ok) throw new Error('not recognised');
		expect(result.preview.rows.map((r) => r.status !== 'rejected' && r.reading)).toEqual([
			{ measuredAt: '2025-07-18T06:30:00.000Z', timeZone: TZ, systolic: 137, diastolic: 84, note: 'Start medicatie' },
			{ measuredAt: '2026-03-02T20:00:00.000Z', timeZone: TZ, systolic: 150, diastolic: 92, note: 'na "zware" dag; moe' },
			{ measuredAt: '2026-10-25T06:42:00.000Z', timeZone: TZ, systolic: 138, diastolic: 86 }
		]);
	});
});

describe('buildWorkbook (E2)', () => {
	it('round-trips through the importer: re-importing adds nothing', () => {
		const data = buildWorkbook(READINGS);
		const now = new Date('2026-10-25T12:00:00Z');
		const fresh = previewImport(data, { timeZone: TZ, now });
		if (!fresh.ok) throw new Error('not recognised');
		expect(fresh.sheet).toBe('Metingen');
		expect(fresh.preview.counts).toEqual({ ready: 3, 'needs-confirmation': 0, duplicate: 0, rejected: 0 });
		expect(fresh.preview.rows.map((r) => r.status !== 'rejected' && [r.unit, r.reading.measuredAt])).toEqual([
			['mmHg', '2025-07-18T06:30:00.000Z'],
			['mmHg', '2026-03-02T20:00:00.000Z'],
			['mmHg', '2026-10-25T06:42:00.000Z']
		]);

		const again = previewImport(data, { timeZone: TZ, now, existing: READINGS });
		expect(again.ok && again.preview.counts.duplicate).toBe(3);
	});
});

describe('buildFullExport (E3)', () => {
	let db: TensieDb;
	beforeEach(() => {
		db = createDb(`test-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
	});
	afterEach(async () => {
		await db.delete();
	});

	it('holds every reading (deleted ones too), the settings and the import history', async () => {
		const now = new Date('2026-10-25T12:00:00Z');
		const kept = await addReading(db, { measuredAt: '2026-10-25T06:42:00.000Z', timeZone: TZ, systolic: 138, diastolic: 86 }, now);
		const gone = await addReading(db, { measuredAt: '2026-10-24T06:42:00.000Z', timeZone: TZ, systolic: 150, diastolic: 90 }, now);
		await deleteReading(db, gone.id, now);
		await saveSettings(db, { birthYear: 1976 }, now);
		const preview = previewImport(buildWorkbook([READINGS[1]]), { timeZone: TZ, now });
		if (!preview.ok) throw new Error('not recognised');
		await saveImport(db, preview.preview, { fileName: 'oud.xlsx', now });

		const result = await buildFullExport(db, now);
		expect(result).toMatchObject({ app: 'Tensie', format: 1, exportedAt: now.toISOString() });
		expect(result.readings.map((r) => [r.systolic, r.deleted, r.source])).toEqual([
			[137, false, 'import'],
			[150, true, 'manual'],
			[138, false, 'manual']
		]);
		expect(result.readings.find((r) => r.id === kept.id)).toEqual(kept);
		expect(result.settings).toEqual([expect.objectContaining({ birthYear: 1976 })]);
		expect(result.imports).toEqual([expect.objectContaining({ fileName: 'oud.xlsx', readingCount: 1 })]);
		// Plain data: survives JSON.
		expect(JSON.parse(JSON.stringify(result))).toEqual(result);
	});
});

describe('buildReport (E1)', () => {
	const OPTIONS = {
		range: { start: '2026-03-01', end: '2026-10-25' },
		thresholds: DEFAULT_THRESHOLDS,
		windows: DEFAULT_DAY_PART_WINDOWS,
		timeZone: TZ
	};

	it('covers the period only, as a log oldest first, with categories as text', () => {
		const report = buildReport(READINGS, OPTIONS);
		expect(report.rows).toEqual([
			{
				date: '02/03/2026',
				time: '21:00',
				systolic: 150,
				diastolic: 92,
				systolicCategory: 'mild',
				diastolicCategory: 'mild',
				dayPart: 'evening',
				arm: 'right',
				note: 'na "zware" dag; moe'
			},
			{
				date: '25/10/2026',
				time: '07:42',
				systolic: 138,
				diastolic: 86,
				systolicCategory: 'mild',
				diastolicCategory: 'mild',
				dayPart: 'morning',
				arm: 'left'
			}
		]);
	});

	it('summarises the period, its day parts and months, with both charts', () => {
		const report = buildReport(READINGS, OPTIONS);
		expect(report.summary).toMatchObject({ count: 2, systolic: 144, diastolic: 89 });
		expect(report.morning).toMatchObject({ count: 1, systolic: 138 });
		expect(report.evening).toMatchObject({ count: 1, systolic: 150 });
		expect(report.months.map((m) => [m.label, m.summary.count, m.limitedData])).toEqual([
			['Oktober 2026', 1, true],
			['Maart 2026', 1, true]
		]);
		expect(report.systolicChart.series).toBe('systolic');
		expect(report.diastolicChart.points.map((p) => p.value)).toEqual([92, 86]);
	});
});
