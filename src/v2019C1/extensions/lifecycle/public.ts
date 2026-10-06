// Public types for the lifecycle report/apply surface — the contract a consumer (e.g. a
// merge-review UI) types against when calling `query.lifecycle.report` /
// `tx.lifecycle.apply`. The runtime `lifecycle` extension object is registered via
// `createSclProject`; only its types are re-exported here — aggregated from each
// sub-domain's own `public.ts`.

export type {
	AttributeChange,
	DecisionGroup,
	DecisionMap,
	DiffChange,
	DiffNode,
	DiffReport,
	DiffSummary,
	GroupDecision,
} from './engine/public'

export type { AttributeEditability, EditableAttribute } from './constraints/public'

export type {
	LifecycleApplyParams,
	LifecycleReportParams,
	Resolution,
	LifecycleScenario,
	LifecycleTarget,
	LifecycleVerb,
} from './contract.types'

export type { AppliedInstances, ApplyResult } from './apply'

export type {
	DecisionMapping,
	MappingCandidate,
	MappingCollision,
	MappingKind,
	DecisionMappings,
	MappingReason,
	ReportMapping,
} from './mapping'

export { presentationScope } from './report/public'
export type { PresentationScope } from './report/public'

export { TEMPLATE_UUID_WARNING_INFO } from './validate'
export type {
	TemplateUuidWarning,
	TemplateUuidWarningCode,
	TemplateUuidWarningInfo,
} from './validate'
