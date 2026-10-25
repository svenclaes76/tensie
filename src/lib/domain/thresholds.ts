import type { CategoryLimits, Thresholds } from './types';
import { VALUE_RANGES } from './validation';

/** T3 defaults, as used in Bloeddruk.xlsx. */
export const DEFAULT_THRESHOLDS: Thresholds = {
	systolic: { mild: 135, moderate: 160, severe: 180 },
	diastolic: { mild: 85, moderate: 100, severe: 110 }
};

export type ThresholdError =
	| { kind: 'not-integer'; measure: keyof Thresholds; limit: keyof CategoryLimits }
	/** Outside the plausible range of the measure (C4), e.g. systolic below 60. */
	| { kind: 'out-of-range'; measure: keyof Thresholds; limit: keyof CategoryLimits }
	| {
			kind: 'not-rising';
			measure: keyof Thresholds;
			lower: keyof CategoryLimits;
			upper: keyof CategoryLimits;
	  };

const LIMIT_ORDER: (keyof CategoryLimits)[] = ['mild', 'moderate', 'severe'];

/**
 * T2: each limit must be a whole number within the measure's plausible range (C4) and strictly
 * higher than the one before. With inclusive lower limits only, strictly rising limits leave no
 * gaps or overlaps.
 * Returns an empty array when the thresholds are valid.
 */
export function validateThresholds(thresholds: Thresholds): ThresholdError[] {
	const errors: ThresholdError[] = [];
	for (const measure of ['systolic', 'diastolic'] as const) {
		const limits = thresholds[measure];
		const { min, max } = VALUE_RANGES[measure];
		for (const limit of LIMIT_ORDER) {
			if (!Number.isInteger(limits[limit])) errors.push({ kind: 'not-integer', measure, limit });
			else if (limits[limit] < min || limits[limit] > max)
				errors.push({ kind: 'out-of-range', measure, limit });
		}
		for (let i = 1; i < LIMIT_ORDER.length; i++) {
			const lower = LIMIT_ORDER[i - 1];
			const upper = LIMIT_ORDER[i];
			if (!(limits[upper] > limits[lower])) errors.push({ kind: 'not-rising', measure, lower, upper });
		}
	}
	return errors;
}
