/**
 * Delimited-text parsing for audience uploads.
 *
 * Deliberately import-free and written in erasable TypeScript so it loads in the
 * browser, in a route handler and directly under `node --test`.
 */

/** A parsed sheet: the header row, then the data rows padded to the header width. */
export type Table = {
  headers: string[];
  rows: string[][];
};

/** Picks the delimiter from the header line — comma, semicolon or tab. */
export function sniffDelimiter(text: string): string {
  const line = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const counts: [string, number][] = [
    [",", (line.match(/,/g) || []).length],
    [";", (line.match(/;/g) || []).length],
    ["\t", (line.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/**
 * RFC 4180-ish reader: quoted fields may hold the delimiter, newlines and
 * doubled quotes. Blank lines are dropped.
 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = delimiter || sniffDelimiter(body);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === sep) endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") continue;
    else field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/** Turns a grid into a header row plus rows padded to the header width. */
export function toTable(grid: string[][]): Table {
  if (!grid.length) return { headers: [], rows: [] };
  const headers = grid[0].map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`));
  const rows = grid.slice(1).map((r) => headers.map((_, i) => (r[i] === undefined ? "" : String(r[i]).trim())));
  return { headers, rows };
}

export function parseCsv(text: string): Table {
  return toTable(parseDelimited(text));
}
