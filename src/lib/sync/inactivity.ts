/**
 * P3: a session ends after 30 days without use. The free Supabase plan has no server-side
 * inactivity timeout, so each device enforces it for itself: it remembers when it was last used and
 * logs out locally when that was too long ago.
 */
export const INACTIVITY_DAYS = 30;

const KEY = 'tensie.lastActiveAt';
const DAY_MS = 86_400_000;

/** True when the last use is more than `days` ago. Unknown (never recorded) is not inactive. */
export function isInactive(lastActiveAt: string | null, now: Date, days = INACTIVITY_DAYS): boolean {
	if (!lastActiveAt) return false;
	const last = Date.parse(lastActiveAt);
	if (Number.isNaN(last)) return false;
	return now.getTime() - last > days * DAY_MS;
}

/** The last recorded use on this device, or null (none yet, or storage unavailable). */
export function readLastActive(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

/** Records use now. Storage can be unavailable (private mode); then the check simply never fires. */
export function markActive(now: Date = new Date()) {
	try {
		localStorage.setItem(KEY, now.toISOString());
	} catch {
		// Nothing to do: losing this only means the device is not logged out after 30 days.
	}
}
