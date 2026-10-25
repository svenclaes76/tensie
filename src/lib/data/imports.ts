import { localMinuteKey } from '../domain/dayPart';
import type { ImportPreview, ParsedRow } from '../domain/import/parse';
import type { ImportRecord, Reading, TensieDb } from './db';

type SavableRow = Exclude<ParsedRow, { status: 'rejected' }>;

export interface SaveImportOptions {
	fileName: string;
	/** Row numbers of flagged rows the user confirmed; other flagged rows are left out. */
	confirmedRows?: Iterable<number>;
	now?: Date;
}

export interface SaveImportResult {
	/** Null when there was nothing to save; no import record is created then. */
	importId: string | null;
	saved: number;
	/** Rows that became duplicates after the preview was made (e.g. saved from another tab). */
	skippedDuplicates: number[];
	/** Flagged rows that were not confirmed and so not saved. */
	unconfirmed: number[];
}

/**
 * Saves an import preview (C9) in one transaction: ready rows plus the flagged rows the user
 * confirmed. Duplicates and rejected rows are never saved. Duplicates are checked again against
 * the database at save time, so a stale preview cannot create them.
 */
export async function saveImport(
	db: TensieDb,
	preview: ImportPreview,
	options: SaveImportOptions
): Promise<SaveImportResult> {
	const confirmed = new Set(options.confirmedRows ?? []);
	const timestamp = (options.now ?? new Date()).toISOString();
	const unconfirmed: number[] = [];
	const wanted = preview.rows.filter((row): row is SavableRow => {
		if (row.status === 'ready') return true;
		if (row.status !== 'needs-confirmation') return false;
		if (confirmed.has(row.rowNumber)) return true;
		unconfirmed.push(row.rowNumber);
		return false;
	});

	return db.transaction('rw', db.readings, db.imports, async () => {
		const taken = new Set(
			(await db.readings.toArray())
				.filter((r) => !r.deleted)
				.map((r) => localMinuteKey(r.measuredAt, r.timeZone))
		);
		const importId = crypto.randomUUID();
		const readings: Reading[] = [];
		const skippedDuplicates: number[] = [];
		for (const row of wanted) {
			const key = localMinuteKey(row.reading.measuredAt, row.reading.timeZone);
			if (taken.has(key)) {
				skippedDuplicates.push(row.rowNumber);
				continue;
			}
			taken.add(key);
			readings.push({
				...row.reading,
				id: crypto.randomUUID(),
				source: 'import',
				importId,
				createdAt: timestamp,
				updatedAt: timestamp,
				deleted: false
			});
		}

		if (readings.length === 0) return { importId: null, saved: 0, skippedDuplicates, unconfirmed };
		await db.readings.bulkAdd(readings);
		await db.imports.add({
			id: importId,
			fileName: options.fileName,
			importedAt: timestamp,
			readingCount: readings.length,
			updatedAt: timestamp,
			deleted: false
		});
		return { importId, saved: readings.length, skippedDuplicates, unconfirmed };
	});
}

/**
 * Undoes a whole import: soft-deletes every reading it saved, including ones edited since, so the
 * deletion syncs like any other. Undoing twice is harmless. The same file can be imported again
 * afterwards, because deleted readings do not count as duplicates.
 */
export async function undoImport(
	db: TensieDb,
	importId: string,
	now: Date = new Date()
): Promise<{ removed: number }> {
	const timestamp = now.toISOString();
	return db.transaction('rw', db.readings, db.imports, async () => {
		const record = await db.imports.get(importId);
		if (!record || record.deleted) throw new Error(`Unknown import: ${importId}`);
		if (record.undoneAt) return { removed: 0 };
		const removed = await db.readings
			.where('importId')
			.equals(importId)
			.and((r) => !r.deleted)
			.modify({ deleted: true, updatedAt: timestamp });
		await db.imports.update(importId, { undoneAt: timestamp, updatedAt: timestamp });
		return { removed };
	});
}

/** Imports newest first, for the import screen's history and undo button. */
export async function listImports(db: TensieDb): Promise<ImportRecord[]> {
	const records = await db.imports.orderBy('importedAt').reverse().toArray();
	return records.filter((r) => !r.deleted);
}
