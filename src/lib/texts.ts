import type { Category } from './domain/types';
import { VALUE_RANGES, type ValueWarning } from './domain/validation';

const { systolic, diastolic } = VALUE_RANGES;

/** How a category is shown; always next to its colour (N4). */
export const CATEGORY_LABEL: Record<Category, string> = {
	normaal: 'Normaal',
	'licht verhoogd': 'Licht verhoogd',
	'gemiddeld verhoogd': 'Gemiddeld verhoogd',
	'ernstig verhoogd': 'Ernstig verhoogd'
};

/** Why values need confirmation (C4), in plain Dutch. */
export const VALUE_WARNING_TEXT: Record<ValueWarning, string> = {
	'systolic-out-of-range': `Bovendruk buiten ${systolic.min}–${systolic.max}`,
	'diastolic-out-of-range': `Onderdruk buiten ${diastolic.min}–${diastolic.max}`,
	'systolic-not-above-diastolic': 'Bovendruk niet hoger dan onderdruk'
};

/** The fixed line; the app never diagnoses or advises. */
export const MEDICAL_NOTE =
	'Tensie geeft geen medisch advies. Bij een zeer hoge meting of klachten: neem contact op met je arts of bel 112.';
