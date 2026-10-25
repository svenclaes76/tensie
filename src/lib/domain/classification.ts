import { CATEGORIES, type Category, type CategoryLimits, type Thresholds } from './types';

export interface ReadingClassification {
	systolic: Category;
	diastolic: Category;
	/** The higher of the two (H4). */
	overall: Category;
}

/** Classifies one value against inclusive lower limits: a value equal to a limit is in that category. */
export function classifyValue(value: number, limits: CategoryLimits): Category {
	if (value >= limits.ernstig) return 'ernstig verhoogd';
	if (value >= limits.gemiddeld) return 'gemiddeld verhoogd';
	if (value >= limits.licht) return 'licht verhoogd';
	return 'normaal';
}

export function maxCategory(a: Category, b: Category): Category {
	return CATEGORIES.indexOf(a) >= CATEGORIES.indexOf(b) ? a : b;
}

/**
 * Systolic and diastolic are classified separately; the reading's overall category is the higher.
 * Never store the result (T4): always classify against the current thresholds.
 */
export function classifyReading(
	reading: { systolic: number; diastolic: number },
	thresholds: Thresholds
): ReadingClassification {
	const systolic = classifyValue(reading.systolic, thresholds.systolic);
	const diastolic = classifyValue(reading.diastolic, thresholds.diastolic);
	return { systolic, diastolic, overall: maxCategory(systolic, diastolic) };
}
