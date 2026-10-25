import { utils, write } from 'xlsx';
import { EXPORT_HEADERS, exportRows, type ExportReading } from './rows';

const MS_PER_DAY = 86_400_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Wall-clock date to an Excel day serial (1900 system), as the importer reads it back. */
function excelDate(isoDate: string): number {
	return (Date.parse(`${isoDate}T00:00:00Z`) - EXCEL_EPOCH) / MS_PER_DAY;
}

/**
 * E2: an .xlsx with real Excel date and time cells, one reading per row, in the layout the
 * importer accepts. Import it from `#lib/export/workbook.js` with a dynamic import: SheetJS is large.
 */
export function buildWorkbook(readings: readonly ExportReading[]): ArrayBuffer {
	const rows = exportRows(readings);
	const sheet = utils.aoa_to_sheet([
		[...EXPORT_HEADERS],
		...rows.map((row) => [
			excelDate(row.isoDate),
			row.minutes / 1440,
			row.systolic,
			row.diastolic,
			// Empty stays empty: no blank text cells.
			row.note || null,
			row.arm || null
		])
	]);
	for (let r = 1; r <= rows.length; r++) {
		sheet[utils.encode_cell({ r, c: 0 })].z = 'dd/mm/yyyy';
		sheet[utils.encode_cell({ r, c: 1 })].z = 'hh:mm';
	}
	sheet['!cols'] = [{ wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 40 }, { wch: 8 }];
	const workbook = utils.book_new();
	utils.book_append_sheet(workbook, sheet, 'Metingen');
	return write(workbook, { type: 'array', bookType: 'xlsx' });
}
