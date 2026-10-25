import type { ImportRecord, Reading, Settings, TensieDb } from '../data/db';

export interface FullExport {
	app: 'Tensie';
	/** Bumped when the shape changes. */
	format: 1;
	exportedAt: string;
	/** Every stored reading, deleted ones included (they are still held, as soft deletes). */
	readings: Reading[];
	settings: Settings[];
	imports: ImportRecord[];
}

/** E3: everything the app holds, for GDPR portability. */
export async function buildFullExport(db: TensieDb, now: Date = new Date()): Promise<FullExport> {
	const [readings, settings, imports] = await Promise.all([
		db.readings.orderBy('measuredAt').toArray(),
		db.settings.toArray(),
		db.imports.orderBy('importedAt').toArray()
	]);
	return { app: 'Tensie', format: 1, exportedAt: now.toISOString(), readings, settings, imports };
}
