// SoW section 8 "Permission Matrix - Minimum Required Behaviour". This is the behaviour the API
// enforces today (each route is guarded by role); it is shown to Admin as a reference.
export const MATRIX_ROLES = [
  'BD Team',
  'Operations Team',
  'Factory Team',
  'Admin',
  'Customer',
] as const;

export interface MatrixRow {
  capability: string;
  cells: Record<(typeof MATRIX_ROLES)[number], string>;
}

const row = (
  capability: string,
  bd: string,
  ops: string,
  factory: string,
  admin: string,
  customer: string,
): MatrixRow => ({
  capability,
  cells: {
    'BD Team': bd,
    'Operations Team': ops,
    'Factory Team': factory,
    Admin: admin,
    Customer: customer,
  },
});

export const PERMISSION_ROWS: MatrixRow[] = [
  row('Create Customer / PO', 'Create / Edit', '—', '—', 'View', '—'),
  row('Inspection', 'Create / Edit', 'View', 'View', 'View', '—'),
  row(
    'Prepare Quotation',
    'Create / Edit',
    '—',
    '—',
    'View / Approve / Edit',
    'View as sent',
  ),
  row('Approve Quotation', '—', '—', '—', 'Approve / Return', '—'),
  row('Client Response', 'Process', '—', '—', 'Process', 'Respond'),
  row('Pickup Request', 'Create / Edit', 'View', 'View', 'View', '—'),
  row('Operations Data', 'View', 'Create / Edit', 'View', 'View', '—'),
  row('Factory Data', 'View', 'View', 'Create / Edit', 'View', '—'),
  row('Teardown Log', '—', 'View', 'View', 'Create / Edit', '—'),
  row('Final Reports', 'View', 'View', 'View', 'Generate', 'View as permitted'),
  row('User Management', '—', '—', '—', 'Create / Edit', '—'),
  row('Audit Log', '—', '—', '—', 'Full', '—'),
];
