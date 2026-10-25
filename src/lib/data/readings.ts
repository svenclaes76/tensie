import type { Reading, TensieDb } from './db';

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
 * Saves a manually entered reading (C1, C2). Plausibility (C4) is checked by the entry screen,
 * which asks for confirmation instead of blocking; here only malformed values are refused.
 */
export async function addReading(
	db: TensieDb,
	input: NewReading,
	now: Date = new Date()
): Promise<Reading> {
	assertMmHg(input.systolic, 'systolic');
	assertMmHg(input.diastolic, 'diastolic');
	if (Number.isNaN(new Date(input.measuredAt).getTime()))
		throw new RangeError(`Invalid measuredAt: ${input.measuredAt}`);

	const timestamp = now.toISOString();
	const note = input.note?.trim();
	const reading: Reading = {
		id: crypto.randomUUID(),
		measuredAt: input.measuredAt,
		timeZone: input.timeZone,
		systolic: input.systolic,
		diastolic: input.diastolic,
		...(input.arm ? { arm: input.arm } : {}),
		...(note ? { note } : {}),
		source: 'manual',
		createdAt: timestamp,
		updatedAt: timestamp,
		deleted: false
	};
	await db.readings.add(reading);
	return reading;
}
