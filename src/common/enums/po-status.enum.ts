// Lifecycle stages from the SoW. A PO is editable by BD only while in Registration.
export enum PoStatus {
  Registration = 'Registration',
  Inspection = 'Inspection',
  Quotation = 'Quotation',
  ClientResponse = 'Client Response',
  Pickup = 'Pickup',
  Operations = 'Operations',
  Factory = 'Factory',
  Weighment = 'Weighment',
  Aor = 'AOR',
  FinalReports = 'Final Reports',
  /** Terminal (Module 4, FR-04.02/FR-04.03): the client rejected the quotation. Not part of
   * the 10-stage pipeline above - callers that render the lifecycle stepper or the dashboard
   * pipeline must use PIPELINE_STATUSES, not Object.values(PoStatus), to exclude it. */
  Rejected = 'Rejected',
}

/** The 10 ordered pipeline stages, excluding the terminal Rejected status. */
export const PIPELINE_STATUSES: PoStatus[] = [
  PoStatus.Registration,
  PoStatus.Inspection,
  PoStatus.Quotation,
  PoStatus.ClientResponse,
  PoStatus.Pickup,
  PoStatus.Operations,
  PoStatus.Factory,
  PoStatus.Weighment,
  PoStatus.Aor,
  PoStatus.FinalReports,
];
