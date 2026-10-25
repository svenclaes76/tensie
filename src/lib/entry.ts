import { classifyValue } from './domain/classification';
import type { Category, CategoryLimits } from './domain/types';
import { checkValues, type ValueWarning } from './domain/validation';

/** Blood pressure values have at most three digits. */
export const MAX_DIGITS = 3;

/** Below this a value is still being typed (or implausible), so no category is shown yet. */
export const BADGE_FROM = 30;

/** Keeps only digits, at most three, as the field is typed. */
export function sanitizeDigits(text: string): string {
	return text.replace(/\D/g, '').slice(0, MAX_DIGITS);
}

/** "146" → 146; empty, zero or anything but 1–3 digits → null. */
export function parseMmHg(text: string): number | null {
	if (!/^\d{1,3}$/.test(text.trim())) return null;
	const value = Number(text);
	return value > 0 ? value : null;
}

/** The category to show beside a field while typing; null shows a neutral "–". */
export function liveCategory(text: string, limits: CategoryLimits): Category | null {
	const value = parseMmHg(text);
	return value === null || value < BADGE_FROM ? null : classifyValue(value, limits);
}

export type EntryWarning = ValueWarning | 'future';

/** Reasons to ask "Klopt dit?" before saving (C4, plus a time in the future). */
export function entryWarnings(
	values: { systolic: number; diastolic: number },
	measuredAt: string,
	now: Date
): EntryWarning[] {
	const warnings: EntryWarning[] = checkValues(values);
	if (new Date(measuredAt).getTime() > now.getTime()) warnings.push('future');
	return warnings;
}
