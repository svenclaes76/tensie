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

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/** "2026-10-25" plus a number of days (negative goes back). */
export function addDays(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * A day as people say it: "Vandaag, 25 okt", "Gisteren, 24 okt", "do 23 okt",
 * or "23 okt 2025" for another year.
 */
export function formatDayLabel(isoDate: string, today: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	const dayMonth = `${day} ${MONTHS[month - 1]}`;
	if (isoDate === today) return `Vandaag, ${dayMonth}`;
	if (isoDate === addDays(today, -1)) return `Gisteren, ${dayMonth}`;
	if (year !== Number(today.slice(0, 4))) return `${dayMonth} ${year}`;
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return `${WEEKDAYS[weekday]} ${dayMonth}`;
}

const MONTH_NAMES = [
	'januari',
	'februari',
	'maart',
	'april',
	'mei',
	'juni',
	'juli',
	'augustus',
	'september',
	'oktober',
	'november',
	'december'
];

/** "2026-10-25" → "zo 25/10", as in the list's date column. */
export function formatShortDay(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return `${WEEKDAYS[weekday]} ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/** "2026-10" → "Oktober 2026". */
export function formatMonth(isoMonth: string): string {
	const [year, month] = isoMonth.split('-').map(Number);
	const name = MONTH_NAMES[month - 1];
	return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

/** "zo 25 okt", with the year added when it is not the current one: "vr 10 okt 2025". */
export function formatWeekdayDate(isoDate: string, today: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	const yearPart = isoDate.slice(0, 4) === today.slice(0, 4) ? '' : ` ${year}`;
	return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}${yearPart}`;
}

/** "25 okt", or "25 okt 2025" with the year. */
function dayMonth(isoDate: string, withYear: boolean): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	return `${day} ${MONTHS[month - 1]}${withYear ? ` ${year}` : ''}`;
}

/**
 * A date range as short as it can be: "19–25 okt", "26 sep–25 okt",
 * "26 okt 2025–25 okt 2026"; a single day is just "25 okt".
 */
export function formatDateRange(start: string, end: string): string {
	if (start === end) return dayMonth(start, false);
	const sameYear = start.slice(0, 4) === end.slice(0, 4);
	if (sameYear && start.slice(0, 7) === end.slice(0, 7))
		return `${Number(start.slice(8))}–${dayMonth(end, false)}`;
	return `${dayMonth(start, !sameYear)}–${dayMonth(end, !sameYear)}`;
}

/** "1 meting" / "3 metingen". */
export function countReadings(count: number): string {
	return `${count} ${count === 1 ? 'meting' : 'metingen'}`;
}
