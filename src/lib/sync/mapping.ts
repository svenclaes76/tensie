import type { ImportRecord, Reading, Settings, SyncedTable } from '../data/db';

/** A row as the server stores it (snake_case), without user_id, which the remote adds. */
export type RemoteRow = Record<string, unknown> & { id: string; updated_at: string; synced_at?: string };

type LocalRow = Reading | Settings | ImportRecord;

/** Local field → server column, per table. Fields not listed (syncPending) stay on the device. */
const COLUMNS: Record<SyncedTable, Record<string, string>> = {
	readings: {
		id: 'id',
		measuredAt: 'measured_at',
		timeZone: 'time_zone',
		systolic: 'systolic',
		diastolic: 'diastolic',
		arm: 'arm',
		note: 'note',
		sessionId: 'session_id',
		source: 'source',
		importId: 'import_id',
		createdAt: 'created_at',
		updatedAt: 'updated_at',
		deleted: 'deleted'
	},
	settings: {
		id: 'id',
		timeZone: 'time_zone',
		patientName: 'patient_name',
		birthYear: 'birth_year',
		thresholds: 'thresholds',
		dayPartWindows: 'day_part_windows',
		updatedAt: 'updated_at',
		deleted: 'deleted'
	},
	imports: {
		id: 'id',
		fileName: 'file_name',
		importedAt: 'imported_at',
		readingCount: 'reading_count',
		undoneAt: 'undone_at',
		updatedAt: 'updated_at',
		deleted: 'deleted'
	}
};

/** Timestamp fields: the server returns "+00:00" offsets and microseconds; the app uses ISO "Z". */
const INSTANTS = new Set(['measuredAt', 'createdAt', 'updatedAt', 'importedAt', 'undoneAt']);

/** A local row as the server expects it. Missing optional fields become null, so a cleared note clears remotely too. */
export function toRemote(table: SyncedTable, row: LocalRow): RemoteRow {
	const remote: Record<string, unknown> = {};
	for (const [field, column] of Object.entries(COLUMNS[table])) {
		remote[column] = (row as unknown as Record<string, unknown>)[field] ?? null;
	}
	return remote as RemoteRow;
}

/** A server row as the app stores it; nulls are left out, instants normalised. */
export function fromRemote(table: SyncedTable, remote: RemoteRow): LocalRow {
	const row: Record<string, unknown> = {};
	for (const [field, column] of Object.entries(COLUMNS[table])) {
		const value = remote[column];
		if (value === null || value === undefined) continue;
		row[field] = INSTANTS.has(field) ? new Date(value as string).toISOString() : value;
	}
	return row as unknown as LocalRow;
}
