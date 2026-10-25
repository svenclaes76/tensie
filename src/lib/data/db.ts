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
	/**
	 * 1 while the row has a change the server has not confirmed yet (N2). Set by a hook on every
	 * local write, so no write can be forgotten; cleared by sync. A number, so it can be indexed.
	 */
	syncPending?: 0 | 1;
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
	/** For the report to the doctor (E1). */
	patientName?: string;
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
	syncState: EntityTable<SyncState, 'table'>;
};

export const SYNCED_TABLES = ['readings', 'settings', 'imports'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Per table: the server's synced_at of the newest change pulled so far. */
export interface SyncState {
	table: SyncedTable;
	cursor: string | null;
}

/** Marks a transaction whose writes come from the server, so they are not sent back. */
const FROM_SYNC = Symbol('fromSync');

/** Runs `work` in a transaction whose writes do not mark rows as pending. */
export function fromSync<T>(db: TensieDb, tables: SyncedTable[], work: () => Promise<T>): Promise<T> {
	return db.transaction('rw', [...tables.map((t) => db[t]), db.syncState], async () => {
		(Dexie.currentTransaction as unknown as Record<symbol, boolean>)[FROM_SYNC] = true;
		return work();
	});
}

function isFromSync(transaction: unknown): boolean {
	let tx = transaction as { parent?: unknown; [FROM_SYNC]?: boolean } | undefined;
	while (tx) {
		if (tx[FROM_SYNC]) return true;
		tx = tx.parent as typeof tx;
	}
	return false;
}

/** Opens the database; tests pass their own name and an in-memory IndexedDB. */
export function createDb(name = 'tensie', options?: DexieOptions): TensieDb {
	const db = new Dexie(name, options) as TensieDb;
	db.version(1).stores({
		readings: 'id, measuredAt, updatedAt, importId',
		settings: 'id, updatedAt',
		imports: 'id, importedAt, updatedAt'
	});
	// v2: sync. Everything stored before is pending, so the first sync uploads it.
	db.version(2)
		.stores({
			readings: 'id, measuredAt, updatedAt, importId, syncPending',
			settings: 'id, updatedAt, syncPending',
			imports: 'id, importedAt, updatedAt, syncPending',
			syncState: 'table'
		})
		.upgrade(async (tx) => {
			for (const table of SYNCED_TABLES) await tx.table(table).toCollection().modify({ syncPending: 1 });
		});

	for (const table of SYNCED_TABLES) {
		db[table].hook('creating', (_key, row, tx) => {
			(row as SyncedRow).syncPending = isFromSync(tx) ? 0 : 1;
		});
		db[table].hook('updating', (changes, _key, _row, tx) =>
			isFromSync(tx) || 'syncPending' in (changes as object) ? undefined : { syncPending: 1 }
		);
	}
	return db;
}

export const db = createDb();
