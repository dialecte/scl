/** Lineage attributes — identity backbone, never user-editable. */
export const LINEAGE = new Set(['uuid', 'templateUuid', 'originUuid'])

/** The classifier modes the UI may expose as editable inputs (no identity/reference side effect). */
export const EDITABLE_MODES = ['rename', 'free'] as const

/** No attribute: what a tag naming no type by id holds as type-id references. */
export const NO_ATTRIBUTES: ReadonlySet<string> = new Set()
