import { afterEach, describe, expect, it, vi } from 'vitest';
import { INACTIVITY_DAYS, isInactive, markActive, readLastActive } from './inactivity';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('isInactive (P3)', () => {
	it('uses 30 days', () => {
		expect(INACTIVITY_DAYS).toBe(30);
	});

	it.each([
		['just now', 0, false],
		['29 days ago', 29 * DAY, false],
		['exactly 30 days ago', 30 * DAY, false],
		['30 days and 1 minute ago', 30 * DAY + 60_000, true],
		['a year ago', 365 * DAY, true]
	])('last use %s → inactive: %s', (_label, msAgo, expected) => {
		expect(isInactive(ago(msAgo), NOW)).toBe(expected);
	});

	it('does not log out when the last use is unknown or unreadable', () => {
		expect(isInactive(null, NOW)).toBe(false);
		expect(isInactive('not a date', NOW)).toBe(false);
	});
});

describe('markActive / readLastActive', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('remembers the last use on this device', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, value)
		});
		expect(readLastActive()).toBeNull();
		markActive(NOW);
		expect(readLastActive()).toBe(NOW.toISOString());
	});

	it('never throws when storage is blocked (private mode)', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		});
		expect(() => markActive(NOW)).not.toThrow();
		expect(readLastActive()).toBeNull();
	});
});
