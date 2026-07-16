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
	GroupDecision,
} from './engine/diff.types'

export type {
	AttributeEditability,
	EditableAttribute,
} from './constraints/classify-attribute.types'

export type { LifecycleApplyParams, LifecycleTarget, LifecycleVerb } from './seam.types'
