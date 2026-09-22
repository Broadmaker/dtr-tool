// Built-in sample workbook so AOs can explore without real data.
// xlsx is lazy-loaded: the sample chunk only downloads when clicked.
const HEADERS = ['Employee Name', 'Date', 'Time', 'Status'];
const ROWS: (string | number)[][] = [
  ['Juan Dela Cruz', '09/01/2026', '07:32', 'IN'],
  ['Juan Dela Cruz', '09/01/2026', '12:01', 'OUT'],
  ['Juan Dela Cruz', '09/01/2026', '12:59', 'IN'],
  ['Juan Dela Cruz', '09/01/2026', '17:04', 'OUT'],
  ['Juan Dela Cruz', '09/02/2026', '07:41', 'IN'],
  ['Juan Dela Cruz', '09/02/2026', '12:00', 'OUT'],
  ['Juan Dela Cruz', '09/02/2026', '13:01', 'IN'],
  ['Juan Dela Cruz', '09/02/2026', '17:02', 'OUT'],
  ['Juan Dela Cruz', '09/03/2026', '07:35', 'IN'],
  ['Juan Dela Cruz', '09/03/2026', '12:00', 'OUT'],
  ['Juan Dela Cruz', '09/03/2026', '13:00', 'IN'],
  ['Juan Dela Cruz', '09/04/2026', '07:50', 'IN'],
  ['Juan Dela Cruz', '09/04/2026', '12:02', 'OUT'],
  ['Juan Dela Cruz', '09/04/2026', '12:58', 'IN'],
  ['Maria Santos', '09/01/2026', '07:28', 'IN'],
  ['Maria Santos', '09/01/2026', '12:05', 'OUT'],
  ['Maria Santos', '09/01/2026', '13:02', 'IN'],
  ['Maria Santos', '09/01/2026', '17:10', 'OUT'],
  ['Maria Santos', '09/02/2026', '07:55', 'IN'],
  ['Maria Santos', '09/02/2026', '12:00', 'OUT'],
  ['Maria Santos', '09/02/2026', '13:05', 'IN'],
  ['Maria Santos', '09/02/2026', '17:00', 'OUT'],
  ['Maria Santos', '09/03/2026', '07:30', 'IN'],
  ['Maria Santos', '09/03/2026', '17:05', 'OUT'],
];

export async function makeSampleFile(): Promise<File> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...ROWS]);
  XLSX.utils.book_append_sheet(wb, ws, 'Biometric');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], 'sample-biometric.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
