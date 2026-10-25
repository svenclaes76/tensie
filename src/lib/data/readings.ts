import type { Reading, TensieDb } from './db';

/** What the entry and edit screens let the user set. */
export interface NewReading {
	/** ISO 8601 instant. */
	measuredAt: string;
	/** IANA time zone where the reading was taken. */
	timeZone: string;
	/** mmHg. */
	systolic: number;
	/** mmHg. */
	diastolic: number;
	arm?: 'left' | 'right';
	note?: string;
}

function assertMmHg(value: number, field: string) {
	if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${field} must be a positive integer`);
}

/**
 * Refuses malformed input. Plausibility (C4) is checked by the screens, which ask for
 * confirmation instead of blocking.
 */
function validate(input: NewReading) {
	assertMmHg(input.systolic, 'systolic');
	assertMmHg(input.diastolic, 'diastolic');
	if (Number.isNaN(new Date(input.measuredAt).getTime()))
		throw new RangeError(`Invalid measuredAt: ${input.measuredAt}`);
}

/** The user-editable fields, with an empty arm or note left out. */
function editableFields(input: NewReading) {
	const note = input.note?.trim();
	return {
		measuredAt: input.measuredAt,
		timeZone: input.timeZone,
		systolic: input.systolic,
		diastolic: input.diastolic,
		arm: input.arm || undefined,
		note: note || undefined
	};
}

/** Saves a manually entered reading (C1, C2). */
export async function addReading(
	db: TensieDb,
	input: NewReading,
	now: Date = new Date()
): Promise<Reading> {
	validate(input);
	const timestamp = now.toISOString();
	const { arm, note, ...fields } = editableFields(input);
	const reading: Reading = {
		id: crypto.randomUUID(),
		...fields,
		...(arm ? { arm } : {}),
		...(note ? { note } : {}),
		source: 'manual',
		createdAt: timestamp,
		updatedAt: timestamp,
		deleted: false
	};
	await db.readings.add(reading);
	return reading;
}

/** A reading that has not been deleted, or undefined. */
export async function getReading(db: TensieDb, id: string): Promise<Reading | undefined> {
	const reading = await db.readings.get(id);
	return reading && !reading.deleted ? reading : undefined;
}

/**
 * Saves an edit (C7). Source and import id stay, so undoing an import still removes an edited
 * reading. Returns false when nothing changed: no write, so sync has nothing to send.
 */
export async function updateReading(
	db: TensieDb,
	id: string,
	input: NewReading,
	now: Date = new Date()
): Promise<boolean> {
	validate(input);
	return db.transaction('rw', db.readings, async () => {
		const current = await getReading(db, id);
		if (!current) throw new Error(`Unknown reading: ${id}`);
		const fields = editableFields(input);
		const changed = (Object.keys(fields) as (keyof typeof fields)[]).some(
			(key) => fields[key] !== current[key]
		);
		if (!changed) return false;
		// Dexie removes a property set to undefined, so a cleared arm or note disappears.
		await db.readings.update(id, { ...fields, updatedAt: now.toISOString() });
		return true;
	});
}

/** Deletes a reading softly (C7), so the deletion syncs and can be undone. */
export async function deleteReading(db: TensieDb, id: string, now: Date = new Date()) {
	const updated = await db.readings
		.where('id')
		.equals(id)
		.and((r) => !r.deleted)
		.modify({ deleted: true, updatedAt: now.toISOString() });
	if (updated === 0) throw new Error(`Unknown reading: ${id}`);
}

/** Undoes a deletion. Harmless when the reading is not deleted. */
export async function restoreReading(db: TensieDb, id: string, now: Date = new Date()) {
	await db.readings
		.where('id')
		.equals(id)
		.and((r) => r.deleted)
		.modify({ deleted: false, updatedAt: now.toISOString() });
}
