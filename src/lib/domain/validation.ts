/** C4: plausible ranges in mmHg, inclusive. Values outside ask for confirmation, never block. */
export const VALUE_RANGES = {
	systolic: { min: 60, max: 260 },
	diastolic: { min: 30, max: 160 }
} as const;

export type ValueWarning =
	| 'systolic-out-of-range'
	| 'diastolic-out-of-range'
	| 'systolic-not-above-diastolic';

/** Returns the reasons a reading needs confirmation; empty when it looks plausible. */
export function checkValues(values: { systolic: number; diastolic: number }): ValueWarning[] {
	const warnings: ValueWarning[] = [];
	const { systolic, diastolic } = VALUE_RANGES;
	if (values.systolic < systolic.min || values.systolic > systolic.max)
		warnings.push('systolic-out-of-range');
	if (values.diastolic < diastolic.min || values.diastolic > diastolic.max)
		warnings.push('diastolic-out-of-range');
	if (values.systolic <= values.diastolic) warnings.push('systolic-not-above-diastolic');
	return warnings;
}
