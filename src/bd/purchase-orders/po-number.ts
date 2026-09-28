// PO number format is still TBC by the client. Change it here only.
export function counterKey(year: number): string {
  return `po-${year}`;
}

export function formatPoNumber(year: number, seq: number): string {
  return `PO-${year}-${String(seq).padStart(4, '0')}`;
}
