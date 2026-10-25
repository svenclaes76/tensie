import { read, utils, type CellObject, type WorkBook } from 'xlsx';
import type { Cell } from './cells';
import { detectColumns, type ColumnMapping } from './columns';
import { parseRows, type ImportOptions, type ImportPreview } from './parse';

export interface SheetData {
	name: string;
	/** Cell values from A1 down; row 0 is spreadsheet row 1, so indexes match Excel. */
	rows: Cell[][];
	date1904: boolean;
}

function cellValue(cell: CellObject | undefined): Cell {
	if (!cell) return null;
	switch (cell.t) {
		case 's':
		case 'n':
		case 'b':
			return cell.v as Cell;
		default:
			// Errors ('e'), stubs ('z') and anything unexpected count as empty.
			return null;
	}
}

function toSheetData(workbook: WorkBook, name: string): SheetData {
	const sheet = workbook.Sheets[name];
	const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
	if (!sheet['!ref']) return { name, rows: [], date1904 };
	const range = utils.decode_range(sheet['!ref']);
	const rows: Cell[][] = [];
	for (let r = 0; r <= range.e.r; r++) {
		const row: Cell[] = [];
		for (let c = 0; c <= range.e.c; c++) row.push(cellValue(sheet[utils.encode_cell({ r, c })]));
		rows.push(row);
	}
	return { name, rows, date1904 };
}

/**
 * Reads an .xlsx, .xls or .csv file into plain rows. Dates stay Excel serials and CSV text is
 * not interpreted (raw), so dd/mm/yyyy is never read as a US date.
 */
export function readSpreadsheet(data: ArrayBuffer | Uint8Array): SheetData[] {
	const workbook = read(data, { type: 'array', raw: true, cellDates: false, dense: false });
	return workbook.SheetNames.map((name) => toSheetData(workbook, name));
}

export type PreviewResult =
	| { ok: true; sheet: string; mapping: ColumnMapping; preview: ImportPreview }
	/** No sheet has recognisable headers: let the user map the columns on one of `sheets`. */
	| { ok: false; reason: 'no-columns-detected'; sheets: SheetData[] };

/**
 * Reads a file and builds the import preview from the first sheet whose headers are recognised
 * (Blad1 in Bloeddruk.xlsx; later sheets such as Blad2 are ignored). Pass `mapping` and
 * `sheet` to use columns the user mapped by hand.
 */
export function previewImport(
	data: ArrayBuffer | Uint8Array,
	options: ImportOptions & { sheet?: string; mapping?: ColumnMapping }
): PreviewResult {
	const sheets = readSpreadsheet(data);
	const candidates = options.sheet ? sheets.filter((s) => s.name === options.sheet) : sheets;
	for (const sheet of candidates) {
		const mapping = options.mapping ?? detectColumns(sheet.rows);
		if (!mapping) continue;
		const preview = parseRows(sheet.rows, mapping, {
			...options,
			date1904: options.date1904 ?? sheet.date1904
		});
		return { ok: true, sheet: sheet.name, mapping, preview };
	}
	return { ok: false, reason: 'no-columns-detected', sheets };
}
