import type { ImportFlag, RejectReason } from '#lib/domain/import/parse.js';
import { VALUE_RANGES } from '#lib/domain/validation.js';

const { systolic, diastolic } = VALUE_RANGES;

/** Why a row asks for confirmation, in plain Dutch. */
export const FLAG_TEXT: Record<ImportFlag, string> = {
	'out-of-sequence': 'Datum valt buiten de volgorde',
	future: 'Datum ligt in de toekomst',
	'systolic-out-of-range': `Bovendruk buiten ${systolic.min}–${systolic.max}`,
	'diastolic-out-of-range': `Onderdruk buiten ${diastolic.min}–${diastolic.max}`,
	'systolic-not-above-diastolic': 'Bovendruk niet hoger dan onderdruk'
};

/** Why a row was skipped, in plain Dutch. */
export const REASON_TEXT: Record<RejectReason, string> = {
	'missing-date': 'Geen datum',
	'invalid-date': 'Datum niet herkend',
	'missing-time': 'Geen tijd',
	'invalid-time': 'Tijd niet herkend',
	'missing-value': 'Waarde ontbreekt',
	'invalid-value': 'Waarde niet herkend',
	'unclear-unit': 'Onduidelijk of dit cmHg of mmHg is'
};
