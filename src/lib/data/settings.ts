import { DEFAULT_DAY_PART_WINDOWS, validateDayPartWindows } from '../domain/dayPart';
import { DEFAULT_THRESHOLDS, validateThresholds } from '../domain/thresholds';
import type { DayPartWindows, Thresholds } from '../domain/types';
import type { Settings, TensieDb } from './db';

/**
 * Settings are one record with a fixed id, so every device updates the same row and sync
 * (last change wins) never ends up with two sets of settings.
 */
export const SETTINGS_ID = 'settings';

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
	const stored = await db.settings.get(SETTINGS_ID);
	const live = stored && !stored.deleted ? stored : undefined;
	return {
		timeZone: live?.timeZone ?? deviceTimeZone(),
		thresholds: live?.thresholds ?? DEFAULT_THRESHOLDS,
		dayPartWindows: live?.dayPartWindows ?? DEFAULT_DAY_PART_WINDOWS
	};
}

/**
 * Saves changed settings (T1, T5). Invalid thresholds (T2) or day-part windows are refused, so
 * the stored settings are always usable; every screen reclassifies from them (T4).
 */
export async function saveSettings(
	db: TensieDb,
	changes: Partial<EffectiveSettings>,
	now: Date = new Date()
): Promise<EffectiveSettings> {
	if (changes.thresholds && validateThresholds(changes.thresholds).length > 0)
		throw new RangeError('Invalid thresholds');
	if (changes.dayPartWindows && validateDayPartWindows(changes.dayPartWindows).length > 0)
		throw new RangeError('Invalid day-part windows');

	return db.transaction('rw', db.settings, async () => {
		const next: EffectiveSettings = { ...(await getSettings(db)), ...changes };
		const row: Settings = {
			id: SETTINGS_ID,
			...next,
			updatedAt: now.toISOString(),
			deleted: false
		};
		await db.settings.put(row);
		return next;
	});
}
