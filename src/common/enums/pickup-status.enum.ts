// Module 5: a pickup request is a single simple form, not a versioned/approval workflow
// (the SoW permission matrix gives BD create/edit and everyone else view-only, no approver).
export enum PickupStatus {
  Draft = 'Draft',
  Generated = 'Generated',
}
