import type { ImportFlag, RejectReason } from '#lib/domain/import/parse.js';
import { VALUE_WARNING_TEXT } from '#lib/texts.js';

/** Why a row asks for confirmation, in plain Dutch. */
export const FLAG_TEXT: Record<ImportFlag, string> = {
	'out-of-sequence': 'Datum valt buiten de volgorde',
	future: 'Datum ligt in de toekomst',
	...VALUE_WARNING_TEXT
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
