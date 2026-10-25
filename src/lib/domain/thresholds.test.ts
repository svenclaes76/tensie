import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, validateThresholds } from './thresholds';
import type { Thresholds } from './types';

function withSystolic(limits: Partial<Thresholds['systolic']>): Thresholds {
	return { ...DEFAULT_THRESHOLDS, systolic: { ...DEFAULT_THRESHOLDS.systolic, ...limits } };
}

describe('DEFAULT_THRESHOLDS (T3)', () => {
	it('are 135/85, 160/100 and 180/110', () => {
		expect(DEFAULT_THRESHOLDS).toEqual({
			systolic: { licht: 135, gemiddeld: 160, ernstig: 180 },
			diastolic: { licht: 85, gemiddeld: 100, ernstig: 110 }
		});
	});

	it('are valid', () => {
		expect(validateThresholds(DEFAULT_THRESHOLDS)).toEqual([]);
	});
});

describe('validateThresholds (T2)', () => {
	it('accepts limits exactly one apart', () => {
		expect(validateThresholds(withSystolic({ licht: 135, gemiddeld: 136, ernstig: 137 }))).toEqual(
			[]
		);
	});

	it('rejects equal neighbouring limits', () => {
		expect(validateThresholds(withSystolic({ gemiddeld: 135 }))).toEqual([
			{ kind: 'not-rising', measure: 'systolic', lower: 'licht', upper: 'gemiddeld' }
		]);
	});

	it('rejects falling limits', () => {
		const errors = validateThresholds({
			...DEFAULT_THRESHOLDS,
			diastolic: { licht: 85, gemiddeld: 110, ernstig: 100 }
		});
		expect(errors).toEqual([
			{ kind: 'not-rising', measure: 'diastolic', lower: 'gemiddeld', upper: 'ernstig' }
		]);
	});

	it('rejects non-integer and non-positive limits', () => {
		expect(validateThresholds(withSystolic({ licht: 134.5 }))).toContainEqual({
			kind: 'not-integer',
			measure: 'systolic',
			limit: 'licht'
		});
		expect(validateThresholds(withSystolic({ licht: 0 }))).toContainEqual({
			kind: 'not-positive',
			measure: 'systolic',
			limit: 'licht'
		});
		expect(validateThresholds(withSystolic({ licht: Number.NaN }))).toContainEqual({
			kind: 'not-integer',
			measure: 'systolic',
			limit: 'licht'
		});
	});
});
