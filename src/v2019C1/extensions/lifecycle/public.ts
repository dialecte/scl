// Public types for the lifecycle report/apply seam — the contract a consumer (e.g. a
// merge-review UI) types against when calling `query.lifecycle.report` /
// `tx.lifecycle.apply`. The runtime `lifecycle` extension object is registered via
// `createSclProject`; only its types are re-exported here.

export type {
	AttributeChange,
	DecisionGroup,
	DecisionMap,
	DiffChange,
	DiffNode,
	DiffReport,
	DiffSummary,
	GroupConflict,
	GroupDecision,
} from './engine/diff.types'

export type {
	AttributeEditability,
	EditableAttribute,
} from './constraints/classify-attribute.types'

export type {
	LifecycleApplyParams,
	LifecycleScenario,
	LifecycleTarget,
	LifecycleVerb,
} from './seam.types'

export { presentationScope } from './presentation-scope'
export type { PresentationScope } from './presentation-scope'
