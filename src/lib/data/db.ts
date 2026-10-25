import Dexie, { type DexieOptions, type EntityTable } from 'dexie';
import type { DayPartWindows, Thresholds } from '../domain/types';

/**
 * Every row carries a client-generated UUID, updatedAt and a soft-delete flag so it can be
 * synced later (push local changes, pull server changes, last updatedAt wins).
 * Categories are never stored (T4).
 */
interface SyncedRow {
	id: string;
	/** ISO 8601 instant. */
	updatedAt: string;
	deleted: boolean;
}

export interface Reading extends SyncedRow {
	/** ISO 8601 instant. */
	measuredAt: string;
	/** IANA time zone where the reading was taken. */
	timeZone: string;
	/** mmHg, integer. */
	systolic: number;
	/** mmHg, integer. */
	diastolic: number;
	arm?: 'left' | 'right';
	note?: string;
	sessionId?: string;
	source: 'manual' | 'import';
	/** Set for imported rows so a whole import can be undone (C9). */
	importId?: string;
	createdAt: string;
}

export interface Settings extends SyncedRow {
	timeZone: string;
	birthYear?: number;
	thresholds: Thresholds;
	dayPartWindows: DayPartWindows;
}

/** One saved import (C9), so it can be listed and undone as a whole. */
export interface ImportRecord extends SyncedRow {
	fileName: string;
	/** ISO 8601 instant. */
	importedAt: string;
	/** Readings saved by this import. */
	readingCount: number;
	/** ISO 8601 instant; set once the import has been undone. */
	undoneAt?: string;
}

export type TensieDb = Dexie & {
	readings: EntityTable<Reading, 'id'>;
	settings: EntityTable<Settings, 'id'>;
	imports: EntityTable<ImportRecord, 'id'>;
};

/** Opens the database; tests pass their own name and an in-memory IndexedDB. */
export function createDb(name = 'tensie', options?: DexieOptions): TensieDb {
	const db = new Dexie(name, options) as TensieDb;
	db.version(1).stores({
		readings: 'id, measuredAt, updatedAt, importId',
		settings: 'id, updatedAt',
		imports: 'id, importedAt, updatedAt'
	});
	return db;
}

export const db = createDb();
