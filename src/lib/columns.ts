// Column-mapping types shared by the parser and the mapping UI (set-up.md §12).
export interface ColumnMap {
  employee: number; // -1 = unmapped
  date: number;
  time: number;
  kind: number;
}

export interface SheetPreview {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  totalRows: number;
}

export const unmapped: ColumnMap = { employee: -1, date: -1, time: -1, kind: -1 };
