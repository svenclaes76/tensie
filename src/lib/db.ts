import Dexie, { type EntityTable } from 'dexie';
import type { DayPartWindows, Thresholds } from './domain/types';

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
	arm?: 'links' | 'rechts';
	position?: 'zittend' | 'liggend' | 'staand';
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

export const db = new Dexie('tensie') as Dexie & {
	readings: EntityTable<Reading, 'id'>;
	settings: EntityTable<Settings, 'id'>;
};

db.version(1).stores({
	readings: 'id, measuredAt, updatedAt, importId',
	settings: 'id, updatedAt'
});
