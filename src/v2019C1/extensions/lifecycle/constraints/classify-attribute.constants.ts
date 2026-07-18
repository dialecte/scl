/** Lineage attributes — identity backbone, never user-editable. */
export const LINEAGE = new Set(['uuid', 'templateUuid', 'originUuid'])

/** The classifier modes the UI may expose as editable inputs (no identity/reference side effect). */
export const EDITABLE_MODES = ['rename', 'free'] as const
