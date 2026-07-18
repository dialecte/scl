/**
 * CROSS-CUTTING satellite containers: elements that apply to ANY SCL element
 * (via a uuid reference into it) and therefore travel with WHATEVER subtree
 * contains their target — not owned by a single layer (90-30 §12.1 / §13.1).
 *
 * v1 = `Variable` (via `VariableApplyTo.elementUuid`) and `BehaviorDescription`
 * (via `InputVar`/`OutputVar.lnodeUuid`). Only uuid-bound targets are covered;
 * XPath-selector variables (no `elementUuid`) need XPath resolution (see TO_DO.md)
 * and are deferred.
 */
export const CROSS_CUTTING_SATELLITE_CONTAINERS = ['Variable', 'BehaviorDescription'] as const
