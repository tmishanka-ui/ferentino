import * as XLSX from 'xlsx';

/** Builds a one-sheet workbook from plain row objects and downloads it as .xlsx. */
export function downloadExcel(filename: string, sheetName: string, columns: string[], rows: Record<string, unknown>[]) {
  const data = [columns, ...rows.map((r) => columns.map((c) => r[c] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
