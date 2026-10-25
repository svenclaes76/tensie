import { DEFAULT_DAY_PART_WINDOWS } from '../domain/dayPart';
import { DEFAULT_THRESHOLDS } from '../domain/thresholds';
import type { DayPartWindows, Thresholds } from '../domain/types';
import type { TensieDb } from './db';

export interface EffectiveSettings {
	/** Home time zone: used to read imported files. */
	timeZone: string;
	thresholds: Thresholds;
	dayPartWindows: DayPartWindows;
}

/**
 * Where the device is right now. New readings store this, not the home time zone, so a reading
 * taken abroad keeps its own morning or evening slot.
 */
export function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels';
}

/** The stored settings, or the T3/T5 defaults until the settings screen has saved any. */
export async function getSettings(db: TensieDb): Promise<EffectiveSettings> {
	const stored = (await db.settings.toArray()).find((s) => !s.deleted);
	return {
		timeZone: stored?.timeZone ?? deviceTimeZone(),
		thresholds: stored?.thresholds ?? DEFAULT_THRESHOLDS,
		dayPartWindows: stored?.dayPartWindows ?? DEFAULT_DAY_PART_WINDOWS
	};
}
