export { resolveInstantiableRoot } from './root-selection'
export { cloneTopologyContent } from './clone-topology-content'
export { ensureTopologyFrame, resolveFrameStructure } from './ensure-topology-frame'
export { reconcileTopologyFrame } from './reconcile-topology-frame'
export type { FrameReconciliation } from './reconcile-topology-frame.types'
export { hasScopeInstance, resolveTopologyReconcilables } from './scope-content'
export { resolvePlacementMappings } from './resolve-placement-mappings'
export { resolvePrimaryPlacement } from './resolve-primary-placement'
export { landPrimaries } from './land-primaries'
export { assertPlacementDecided, findLanding } from './placement-landing'
export {
	describeGainedLevels,
	describeHeldPlacement,
	describePlacementMappings,
} from './describe-placement-mappings'
export { findFrameInstances } from './find-frame-instances'
export {
	resolveInstanceLevels,
	resolveTemplateFrame,
	toPinnedMatches,
} from './resolve-instance-levels'
export { resolvePrimaryParents } from './resolve-primary-parents'
export { findHeldLevel, resolveHeldLevels } from './resolve-held-levels'
export type { TopologyReconcilables } from './scope-content.types'
export type {
	EnsureTopologyFrameParams,
	EnsureTopologyFrameResult,
} from './ensure-topology-frame.types'
export type { PlacementLevel } from './resolve-placement-mappings.types'
export type { FrameInstance } from './find-frame-instances.types'
export type {
	GainedLevel,
	HeldLevel,
	InstanceLevels,
	InstancePlacement,
	TemplateFrame,
} from './resolve-instance-levels.types'
export type { PrimaryParents, ResolvePrimaryParentsParams } from './resolve-primary-parents.types'
export type { HeldLevels, InstanceCounterpart } from './resolve-held-levels.types'
export type { OffLevel, PrimaryPlacement } from './resolve-primary-placement.types'
export type { PrimaryLanding } from './land-primaries.types'
