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
	KeptAttributeChange,
	KeptAttributeReason,
	OutsideReference,
	RemovalSideEffect,
	TextChange,
	ReportedElement,
	ReportTarget,
	ReportTargetField,
	ReportWarning,
} from './engine/public'

export type {
	AttributeEditability,
	ConstraintViolation,
	EditableAttribute,
	IdentityCollision,
	MakeUniqueParams,
	PlacementResolution,
} from './constraints/public'

export type {
	AfterApplyHook,
	BoundLogicalNodeTypes,
	IedCollisions,
	ReferencesByName,
	SharedFunctions,
	LifecycleApplyParams,
	LifecycleReportParams,
	Resolution,
	LifecycleScenario,
	LifecycleTarget,
	LifecycleVerb,
	TakeOver,
	TakeOvers,
} from './contract.types'

export type { AppliedInstance, AppliedInstances, AppliedPlacement, ApplyResult } from './apply'

export type {
	AsdExtractOptions,
	ExtractOptions,
	ExtractWarning,
	FsdExtractOptions,
	FunctionPlacement,
	FunctionSection,
	FunctionSections,
	TemplateLink,
} from './extract/transaction/extract.types'

export type {
	DecisionMapping,
	MappingCandidate,
	MappingKind,
	DecisionMappings,
	MappingReason,
	ReportMapping,
} from './mapping'

export { presentationScope } from './report/public'
export type { PresentationScope } from './report/public'

export type {
	SourceRoot,
	SourceRootCandidate,
	SourceRootRef,
	SourceRootUnsupported,
	SourceRootVerb,
} from './source-root'

export type {
	IedScenario,
	IedScenarioOfParams,
	LayerScenario,
	LayerScenarioOfParams,
} from './scenario-of'
export type {
	LifecycleRefusal,
	LifecycleRefusalCode,
	LifecycleRefusalReason,
	Refused as LifecycleRefused,
} from './refusal.types'

export { TEMPLATE_UUID_WARNING_INFO } from './validate'
export type {
	TemplateUuidWarning,
	TemplateUuidWarningCode,
	TemplateUuidWarningInfo,
} from './validate'

export type {
	BoundIed,
	BoundIedAssignment,
	BoundIeds,
	BoundIedsParams,
	BoundLNodes,
	IedClassification,
	IedClassificationBasis,
	IedKind,
} from './ied/public'
export type {
	CidExtractParams,
	ClientRefs,
	IedExtractBase,
	IedExtractParams,
	IedExtractResult,
	InteractingIeds,
	IsdExtractParams,
} from './extract/transaction/ied.types'
export type {
	IedExportFileType,
	IedExportOption,
	IedExportRefusal,
} from './extract/query/export-options.types'

export type {
	ApplyMoveParams,
	MoveAnchorRefusalKey,
	MovedElement,
	MoveRefusal,
	KeyTaken,
	MoveReport,
	ReportMoveParams,
} from './move/public'
export type { CopyUnbind, CopyWrite } from './copy/copy.types'
