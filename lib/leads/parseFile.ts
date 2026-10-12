/**
 * Reads an uploaded lead file into a header row plus data rows, on the server.
 *
 * `.csv` is parsed by our own reader in ./table.ts; `.xlsx` goes through
 * exceljs, which is why this module is server-only — nothing here is shipped to
 * the browser.
 */

import ExcelJS from "exceljs";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from "./limits";
import { toTable, parseCsv, type Table } from "./table";

export type ParseFailure = { code: "too_large" | "bad_type" | "empty" | "unreadable"; message: string };

export function checkFile(name: string, size: number): ParseFailure | null {
  const lower = name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { code: "bad_type", message: "Only .csv and .xlsx files can be uploaded." };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return { code: "too_large", message: "That file is over the 64 MB limit." };
  }
  if (size === 0) return { code: "empty", message: "That file is empty." };
  return null;
}

/** A cell as text: dates, numbers, formulas and hyperlinks all come back readable. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const rich = value as unknown as Record<string, unknown>;
    if (typeof rich.text === "string") return rich.text;
    if (Array.isArray(rich.richText)) {
      return (rich.richText as { text: string }[]).map((part) => part.text).join("");
    }
    if (rich.result !== undefined && rich.result !== null) return String(rich.result);
    if (rich.hyperlink) return String(rich.hyperlink);
    return "";
  }
  return String(value);
}

async function parseXlsx(buffer: ArrayBuffer): Promise<Table> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets.find((s) => s.rowCount > 0) || book.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    // `row.values` is 1-based with a hole at index 0.
    const values = row.values as ExcelJS.CellValue[];
    for (let i = 1; i < values.length; i++) cells.push(cellText(values[i]).trim());
    if (cells.some((c) => c !== "")) grid.push(cells);
  });
  const width = grid.reduce((w, r) => Math.max(w, r.length), 0);
  return toTable(grid.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")])));
}

/** Parses an uploaded file, or returns why it could not be read. */
export async function parseLeadFile(file: File): Promise<{ table: Table } | { error: ParseFailure }> {
  const bad = checkFile(file.name, file.size);
  if (bad) return { error: bad };
  try {
    const table = file.name.toLowerCase().endsWith(".csv")
      ? parseCsv(new TextDecoder().decode(await file.arrayBuffer()))
      : await parseXlsx(await file.arrayBuffer());
    if (!table.headers.length || !table.rows.length) {
      return { error: { code: "empty", message: "That file has no rows under its header." } };
    }
    return { table };
  } catch (error) {
    console.error("[leads] parse failed", error);
    return { error: { code: "unreadable", message: "That file could not be read." } };
  }
}
