// Public types for the lifecycle `engine` domain — the diff/decision contract the
// report/apply surface is built on.

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
	OrderChange,
	ConfRevBump,
	ReportedElement,
	ReportTarget,
	ReportTargetField,
	ReportWarning,
} from './diff.types'
export type { DecisionPolicy } from './decision-policy.types'
