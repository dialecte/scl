/**
 * How a SCL reference path value should be resolved to a UUID.
 *
 * - direct:               the path value IS the exact lookup key
 * - lnode:                LNodeSpecNaming / IEC 7-2 ObjectReference - strip ".DO[.DA]" qualifier from the last segment to get the LN/LNode lookup key
 * - iedAddress:           ExtRef/ExtCtrl address - indexed by full IED-internal path, exact match with IED-relative fallback
 * - behaviorDescription:  path relative to parent BehaviorDescription scope
 * - unsupported:          path format requires context not available during streaming
 */
export const RESOLUTION_TYPE = {
	direct: 'direct',
	lnode: 'lnode',
	iedAddress: 'ied-address',
	behaviorDescription: 'behavior-description',
	unsupported: 'unsupported',
} as const
