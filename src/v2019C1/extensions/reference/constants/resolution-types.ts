/**
 * How a SCL reference path value should be resolved to a UUID.
 *
 * - direct:               the path value IS the exact lookup key
 * - lnode:                LNodeSpecNaming path / IED object reference (IED/LD/LN.DO.DA) - strip ".DO[.DA]" qualifier from the last segment to get the LN/LNode lookup key
 * - iedAddress:           ExtRef/ExtCtrl address - indexed by full IED-internal path, exact match with IED-relative fallback
 * - behaviorDescription:  path relative to parent BehaviorDescription scope
 * - ancestorName:         the bare name of the target, looked up in the referrer's ancestors, nearest first
 * - unsupported:          path format requires context not available during streaming
 */
export const RESOLUTION_TYPE = {
	direct: 'direct',
	lnode: 'lnode',
	iedAddress: 'ied-address',
	behaviorDescription: 'behavior-description',
	ancestorName: 'ancestor-name',
	unsupported: 'unsupported',
} as const
