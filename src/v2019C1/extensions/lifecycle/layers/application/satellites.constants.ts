/**
 * The application layer's SATELLITE links: elements OUTSIDE the Application subtree
 * that the application references OUTWARD (via a ref inside the app) and that
 * therefore travel with it. Unlike the function layer's reverse-ref satellites
 * (`FunctionCategory` points at the function), these are found by collecting the
 * outward ref inside the application and resolving its target.
 *
 * v1 = `AllocationRole` (via `AllocationRoleRef.allocationRoleUuid`).
 */
export const APPLICATION_SATELLITE_LINKS = [
	{ refTag: 'AllocationRoleRef', uuidAttr: 'allocationRoleUuid', targetTag: 'AllocationRole' },
] as const
