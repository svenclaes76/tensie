import { toLocal } from './domain/dayPart';

/** "2025-07-18" → "18/07/2025" (N6). */
export function formatDate(isoDate: string): string {
	const [year, month, day] = isoDate.split('-');
	return `${day}/${month}/${year}`;
}

/** Minutes since midnight → "08:30" (24-hour). */
export function formatTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** An instant as "18/07/2025 08:30" in the given time zone. */
export function formatDateTime(measuredAt: string, timeZone: string): string {
	const { date, minutes } = toLocal(measuredAt, timeZone);
	return `${formatDate(date)} ${formatTime(minutes)}`;
}

/** 9.8 → "9,8"; whole numbers keep one decimal when `decimals` is 1. */
export function formatDecimal(value: number, decimals = 1): string {
	return value.toFixed(decimals).replace('.', ',');
}

/** Zero-based column index → spreadsheet letters: 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
	let letters = '';
	for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
		letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
	return letters;
}

/** "1 meting" / "3 metingen". */
export function countReadings(count: number): string {
	return `${count} ${count === 1 ? 'meting' : 'metingen'}`;
}
