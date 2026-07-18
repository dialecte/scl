/**
 * The function layer's SATELLITE container tags: elements that live OUTSIDE the
 * function subtree but reference back into it and therefore travel with the
 * function (90-30 SCL-Location). The function layer OWNS this list explicitly —
 * satellites are a per-layer concern, not a generic engine data hook.
 *
 * v1 = FunctionCategory (via `FunctionCatRef`). Variable / BehaviorDescription
 * are planned satellites (see the layer checklist) and will be added here with
 * their own clone handlers.
 */
export const FUNCTION_SATELLITE_CONTAINERS = ['FunctionCategory'] as const
