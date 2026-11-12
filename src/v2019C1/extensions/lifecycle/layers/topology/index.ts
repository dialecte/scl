export { readSsdScope, resolveSsdScope } from './resolve-ssd-scope'
export type {
	ResolveSsdScopeParams,
	SsdScope,
	SsdScopeCandidate,
	SsdScopeRead,
	SsdScopeUnit,
} from './resolve-ssd-scope.types'
export { cloneTopologyContent } from './clone-topology-content'
export {
	landAt,
	landLevels,
	landLevelsByTag,
	readTemplateLevels,
	landOnStructure,
	resolveLandedLevels,
	withLandedLevels,
} from './landed-levels'
export type { LandedLevel, TemplateLevel } from './landed-levels.types'
export { ensureTopologyFrame, resolveFrameStructure } from './ensure-topology-frame'
export { resolveFrameLandings } from './frame-landings'
export { reconcileTopologyFrame } from './reconcile-topology-frame'
export type { FrameReconciliation } from './reconcile-topology-frame.types'
export {
	functionsUnderScope,
	hasScopeInstance,
	resolveTopologyReconcilables,
	resolveUnitPlacement,
} from './scope-content'
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
	leaveOutOfFrame,
	pinLeftOut,
	resolveTemplateFrame,
	toPinnedMatches,
} from './resolve-instance-levels'
export { resolvePrimaryParents } from './resolve-primary-parents'
export { findHeldLevel, resolveHeldLevels } from './resolve-held-levels'
export type { TopologyReconcilables, UnitPlacement } from './scope-content.types'
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
export type {
	PrimaryParents,
	PrimaryPlace,
	ResolvePrimaryParentsParams,
} from './resolve-primary-parents.types'
export type { HeldLevels, InstanceCounterpart } from './resolve-held-levels.types'
export type { OffLevel, PrimaryPlacement } from './resolve-primary-placement.types'
export type { PrimaryLanding } from './land-primaries.types'
export { findDroppedPrimaries } from './find-dropped-primaries'
export { landGroundedTerminals, placeLevelsOnStructure } from './grounded-terminals'
