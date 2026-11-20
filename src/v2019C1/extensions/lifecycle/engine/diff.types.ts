import type { EditableAttribute, IdentityCollision } from '../constraints'
import type { LifecycleScenario, LifecycleVerb } from '../contract.types'
import type { OffLevel } from '../layers/topology/resolve-primary-placement.types'
import type { ReportMapping } from '../mapping/mapping.types'
import type { ReferenceOutsideScope } from './contribution-scope.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type { AnyRawRecord } from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/** How a diffed element changed between the (updated) template and the instance. */
// `target-only` = an instance element with NO source lineage (author-added after
// instantiation). It is preserved by default and only removed on explicit accept.
export type DiffChange = 'added' | 'removed' | 'modified' | 'moved' | 'unchanged' | 'target-only'

export type AttributeChange = { name: string; before?: string; after?: string }

/**
 * Why an update keeps the project's value of an attribute the template changes.
 * - `bound-logical-node`: the LNode is bound to a logical node of an IED and the consumer keeps the type of such an
 *   LNode (`resolution.boundLogicalNodeTypes: 'keep'`); by default its type follows the template's, as it is part of
 *   what the LNode was specified with.
 * - `instance-configuration`: the instance configures it where it sits (a behaviour description's file, a variable's
 *   value); a template update does not overwrite it.
 */
export type KeptAttributeReason =
	| 'bound-logical-node'
	| 'instance-configuration'
	| 'conf-rev-only-rises'
	| 'settable-value'
	| 'data-flow'

/** A difference the update lists but does not apply: the project keeps `before`, the template says `after`. */
export type KeptAttributeChange = AttributeChange & { reason: KeptAttributeReason }

/** A text the update lists but does not write: the project keeps `before`, the template says `after`. */
export type KeptTextChange = TextChange & { reason: KeptAttributeReason }

/**
 * Why a change cannot be written as it is suggested, so that its group waits for an explicit decision:
 * - `value-outside-enumeration`: the project's value, which it may set, is not among the values the template's type
 *   now allows; accepted, the template's value is written, skipped, the project's stays;
 * - `names-deleted-data`: a reference (`FCDA`, `ExtRef`) names data the update deletes (a logical node, a device or a
 *   control block it removes, a data object or attribute a logical node's new type lacks); accepted, the entry is
 *   removed or the input's source cleared; skipped, it stays and the group deleting the data cannot be accepted;
 * - `unbinds-another-ied`: the removal, in the specification of an IED an update updates, deletes an LNode the project
 *   bound to another IED; accepted, it goes with that binding (nothing in the other IED changes), skipped, it stays;
 * - `changes-another-ied`: accepting the group, in an IED update, changes another IED (`report.otherIedImpacts` lists
 *   what); accepted, it is written with that change, skipped, the other IED stays as it is.
 */
export type DecisionRequiredReason =
	| 'value-outside-enumeration'
	| 'names-deleted-data'
	| 'unbinds-another-ied'
	| 'changes-another-ied'

/**
 * One element's attributes compared: the changes an accepted update writes, its type references naming a type of other
 * content, and those it keeps.
 */
export type AttributeComparison = {
	changes: AttributeChange[]
	typeChanges: AttributeChange[]
	kept: KeptAttributeChange[]
}

export type DiffNode = {
	change: DiffChange
	tagName: string
	/** Source (template) element — present for `added` / `modified` / `unchanged`. */
	sourceRef?: AnyRefOrRecord
	/** Instance element — present for `removed` / `modified` / `unchanged`. */
	instanceRef?: AnyRefOrRecord
	/** A `moved` node's instance parent before the move: where the instance element is now. */
	movedFrom?: AnyRefOrRecord
	/**
	 * A `moved` node's parent after the move: the instance element its source parent pairs with, or that source parent
	 * itself when it is `added` (resolved through its clone when the update is applied).
	 */
	movedTo?: AnyRefOrRecord
	/**
	 * The element this node became in the APPLIED document, filled by `apply` on the report it
	 * returns (undefined on a pure `report`). Completes the source/instance/applied triple: a
	 * matched/modified node resolves to its `instanceRef` element, an `added` node (and added
	 * companions) to its freshly-cloned element, a `removed` node to nothing. Lets a consumer relate
	 * the report to the apply result by reading the node — no structural re-correlation.
	 */
	appliedRef?: AnyRefOrRecord
	/** Attribute deltas — present for `modified`. */
	attributeChanges?: AttributeChange[]
	/**
	 * The type references of the element (an `LNode`'s `lnType`) whose type the template gives other content than the
	 * project's — `before` the id the instance names, `after` the id the template names (in its own document: the two
	 * may be equal) — present for `modified`. Accepted, the update brings the template's type into the project through
	 * its closure (an equal type the project holds reused, a free id kept, a taken one forked) and points the element at
	 * it; the type it leaves goes when nothing else names it. An equal type under another id is no change.
	 */
	typeChanges?: AttributeChange[]
	/**
	 * The text the template gives an element holding text only (a vendor `Private`, a `BayType`), when it differs from
	 * the instance's — present for `modified`: written as an attribute change is, kept when declined.
	 */
	textChange?: TextChange
	/**
	 * The template's changes the update does not apply, with why — present on a matched node (`modified` or
	 * `unchanged`) that has any. They neither make the node `modified` nor open a decision: there is nothing to accept.
	 */
	keptAttributeChanges?: KeptAttributeChange[]
	/** The text the template gives that the update does not write, with why: see `KeptTextChange`. */
	keptTextChange?: KeptTextChange
	/**
	 * Present on a change the consumer took over (`Resolution.takeOver`): the project kept it otherwise
	 * (`keptTextChange`), it is now listed and written as any change.
	 */
	takenOver?: true
	/** Present on a change that cannot be written as suggested: its group waits for a decision, see `DecisionGroup`. */
	requiresDecision?: DecisionRequiredReason
	/**
	 * Present on an `added` node that collides with an element the instance holds where it lands, on a key none of
	 * whose fields can be changed (an `LNode` sharing class, instance, prefix, device and IED with one the project
	 * added): its group cannot be accepted unless an accepted group removes `collidesWith` — `apply` refuses it with
	 * `IDENTITY_COLLISION` before anything is written.
	 */
	identityCollision?: IdentityCollision
	/**
	 * Present on a reference paired with the template's by the names of what both name, their uuids disagreeing: the
	 * placeholder lineage of the project's target that let it (`Resolution.referencesByName: 'placeholders'`). Listed
	 * in `DiffReport.warnings`.
	 */
	pairedByName?: string
	/**
	 * Present on a node paired with the template's among instance siblings that are the very same thing: references
	 * naming the same target and data, or elements of the same key. Such twins are paired in order. Listed in
	 * `DiffReport.warnings`.
	 */
	pairedAmongTwins?: true
	/**
	 * Present on an IED element paired with the template's by its key (the key, as `name=value` parts; `only <tag>` for a
	 * tag without key the schema holds once, an `LN0`, paired with the one instance element of its tag left free) where
	 * its lineage
	 * names nothing the template holds — an IED file imported again, whose uuid-less elements got other uuids. Listed in
	 * `DiffReport.warnings`.
	 */
	pairedByKey?: string
	/**
	 * Present on a matched data set whose entries the template lists in another order than the update would leave them
	 * (the order is the order the data is sent in): `apply` writes the template's order, the project's own entries
	 * after the entry each followed. Makes the node `modified`.
	 */
	orderChange?: OrderChange
	/**
	 * Present on a matched data set whose entries the update changes (one added, removed or put in another order): the
	 * configuration revision each control block naming it takes, one above its own (the project's own blocks included) —
	 * except a block the template no longer holds (anywhere in the IED); one the template raises above it itself is
	 * listed for when its own change is skipped (`onlyIfBlockSkipped`).
	 * Written by `apply` with the changes of the entries; lists, opens no decision of its own.
	 */
	confRevBumps?: ConfRevBump[]
	/** Present when a control block naming the data set cannot be raised (see `ConfRevNotRaised`): the report warns. */
	confRevNotRaised?: ConfRevNotRaised[]
	children: DiffNode[]
}

/** The order the template gives the entries of a data set: see `DiffNode.orderChange`. */
export type OrderChange = { tagName: 'FCDA' }

/** One control block's `confRev` raised because the data set it names changed. */
export type ConfRevBump = {
	controlBlock: AnyRefOrRecord
	before: string
	after: string
	/**
	 * Present when the template raises the block's revision itself (its own change, listed on its node): this raise is
	 * written only when that change is skipped, the template's value otherwise.
	 */
	onlyIfBlockSkipped?: true
}

/** A control block whose `confRev` a data set change cannot raise: no unsigned 32-bit number, or at its limit. */
export type ConfRevNotRaised = {
	controlBlock: AnyRefOrRecord
	value: string
	refusal: 'invalid' | 'overflow'
}

/** An element's text, as the instance holds it (`before`) and as the template gives it (`after`). */
export type TextChange = { before: string; after: string }

export type DiffSummary = {
	added: number
	removed: number
	modified: number
	/** The elements the source puts under another parent, each one change (`moved`). */
	moved: number
	/**
	 * The template's changes the update lists but does not apply (`keptAttributeChanges` across the tree). They open
	 * no decision: an instance can be `upToDate` and still carry some.
	 */
	kept: number
}

/**
 * The engine's per-instance diff primitive: one instance's change `root` tree, its
 * decision `groups`, and its `summary`. The report builders enrich this into a
 * {@link ReportInstance} (title / linkage) and aggregate several into a
 * {@link DiffReport}. Internal to the report pipeline — consumers see `DiffReport`.
 */
export type InstanceDiff = {
	root: DiffNode
	groups: DecisionGroup[]
	summary: DiffSummary
	/** Where the shared source elements this instance refers to land in the project. */
	mappings?: ReportMapping[]
	/**
	 * Its references naming what the placement does not place (a connectivity node no file of the template holds, an
	 * element left out), with those of the shared elements it refers to: neither listed nor written, told of.
	 */
	referencesNotPlaced?: ReferenceOutsideScope[]
}

/**
 * A decision unit for the full track. The user decides
 * on a GROUP, never on an individual element.
 *
 * - `primary` is the recognizable change ("add Function X").
 * - `companions` are its dependent changes that TRAVEL with it (structural
 *   content now; reference-linked satellites / type-closure / provenance are a
 *   follow-up). They are display-only — never independently toggled.
 * - `dependsOn` are group ids this group requires (skip a parent → its
 *   dependents are disabled). Empty in the first slice.
 */
export type DecisionGroup = {
	/** Stable key of the primary; also the key in the `decisions` map. */
	id: string
	change: Exclude<DiffChange, 'unchanged'>
	/** Coarse label (`"<change> <tag>"`); the UI enriches it via `info.of(primary.sourceRef ?? instanceRef)`. */
	title: string
	primary: DiffNode
	companions: DiffNode[]
	dependsOn: string[]
	suggestedAction: 'accept' | 'skip'
	/**
	 * Present when the group cannot take its suggested action: `apply` refuses decisions that do not name it, with
	 * `DECISION_REQUIRED`. Why, from its primary: see `DecisionRequiredReason`.
	 */
	requiresDecision?: DecisionRequiredReason
	/**
	 * The primary element's user-editable attributes with their edit mode
	 * (schema-derived via the attribute classifier), tagged at report time so the UI
	 * renders inputs directly from the report without re-deriving. Omitted until the
	 * report surface tags it.
	 */
	editableAttributes?: EditableAttribute[]
	/**
	 * What accepting the group makes the delete hooks do outside what it removes: each reference elsewhere in the
	 * project naming an element the group removes, `deleted`, or `cleared` when it keeps its content (a signal input,
	 * a data setting: its uuid, path and companion attributes go). Read only: nothing to decide, the apply writes it
	 * with the removal. Absent when nothing outside is touched, or the group removes nothing.
	 */
	sideEffects?: RemovalSideEffect[]
}

/**
 * What accepting a group of an IED update would change in another IED, listed before the decision with the group bringing
 * it (`groupId`, waiting for a decision: `changes-another-ied`, or `names-deleted-data` for a reference to deleted data):
 * an input of `ied` `deleted` (holding no internal address) or `cleared` with what the update removes (its source, its
 * internal address kept), an input subscribed to data no entry of a control block of the updated IED sends any more
 * `cleared` of that control block (cleared once every group listing it is accepted), or a reference `renamed` with an element of the updated IED it names.
 */
export type OtherIedImpact = {
	/** The name of the IED changed. */
	ied: string
	element: { tagName: string; id: string }
	effect: 'deleted' | 'cleared' | 'renamed'
	groupId: string
}

/** A reference outside what a group removes that the removal deletes or clears: see `DecisionGroup.sideEffects`. */
export type RemovalSideEffect = {
	element: { tagName: string; id: string }
	effect: 'deleted' | 'cleared'
}

/**
 * One instance in a report: a linked template instance (`Application`/`Function`) with
 * its diff tree, its decision groups, and its linkage/up-to-date status. The report is a
 * list of these — a changed instance and an up-to-date instance render through the same
 * shape (the up-to-date one simply has no `groups`).
 */
export type ReportInstance = {
	/** The instance root record (`Application`/`Function`). Omitted for a first-time instantiate. */
	rootRef?: AnyRefOrRecord
	/**
	 * A first placement made several times (a primary the template gained, placed for each instance of
	 * the template): the project element this one is made for — the level it lands under (a primary of
	 * a substation template), or the instance of the application it is placed for (a function the
	 * application gained). Its groups are scoped to it, so each is decided on its own. Absent when the
	 * placement is made once.
	 */
	placedFor?: AnyRefOrRecord
	/** Human-readable title of the instance root (`info.of`). */
	title: string
	/** Recognised as an instantiation of the loaded template (provenance or `templateUuid` lineage). */
	linked: boolean
	/**
	 * Nothing to apply for this instance (`groups.length === 0`). It may still carry changes the update keeps
	 * (`keptAttributeChanges` in its `tree`, counted in the report's `summary.kept`).
	 */
	upToDate: boolean
	/** The full diff tree for this instance (unchanged context included). */
	tree: DiffNode
	/** The change tree folded into accept/skip units for this instance. */
	groups: DecisionGroup[]
	/** Where the shared source elements this instance refers to land in the project. */
	mappings: ReportMapping[]
	/**
	 * The template's functional variants the instance did not select (an application instance holding one variant of
	 * a set the template holds several of), as the template holds them. Neither they nor what they bring are added or
	 * listed as changes; there is nothing to decide. Absent when the instance selected nothing.
	 */
	variantsNotSelected?: AnyRefOrRecord[]
	/**
	 * On a first placement of an application, what its roles refer to that is not placed (a variable applying to nothing
	 * the placement places or lands on; a variable or a behaviour description inside a function the application stands
	 * on that holds no copy of it): neither it nor the reference to it is written. Absent when there is none.
	 */
	satellitesNotPlaced?: AnyRefOrRecord[]
	/**
	 * The references of what it places naming what the placement does not place (a terminal on a node of a bay the
	 * template does not hold, a reference by uuid to an element left out): not written, they would name nothing in the
	 * project. Absent when there is none.
	 */
	referencesNotPlaced?: ReferenceOutsideScope[]
}

/** An element a report names: its tag and record id. */
export type ReportedElement = { tagName: string; id?: string }

/**
 * The target a report was made for, as `query.lifecycle.report` reads it: the documents (their record ids), the
 * layer, the template element, where it lands, the operation (`template` when none was asked for), the instance
 * asked for, if any, and for an IED the type of file the source is, read from its extension.
 */
export type ReportTarget = {
	document: string
	source: string
	verb: LifecycleVerb
	ref: ReportedElement
	anchor: ReportedElement
	scenario: LifecycleScenario
	targetInstance?: ReportedElement
	/** The type of file the source is (`.isd`, `.icd`, `.iid`, or `.scd`, `.xml` and none for an SCD): an IED's report only. */
	fileType?: SclFileType
}

/** What a report applied to another target differs on first: `report` when it carries no target. */
export type ReportTargetField = keyof ReportTarget | 'report'

export type DiffReport = {
	/**
	 * The target the report was made for, written by `query.lifecycle.report`. `tx.lifecycle.apply` refuses a report
	 * applied to another target, or carrying none (`REPORT_TARGET_MISMATCH`). The per-layer reports the surface is
	 * built from carry none.
	 */
	target?: ReportTarget
	/** One entry per reported instance (`Application`/`Function`). */
	instances: ReportInstance[]
	/**
	 * `false` = fast track (apply headless): a first-time instantiate or nothing changed
	 * anywhere. `true` = full track: some instance has changes to resolve.
	 */
	needsDecisions: boolean
	summary: DiffSummary
	/** Where each shared source element lands in the project — one entry per source element. */
	mappings: ReportMapping[]
	/**
	 * The instances of the template already in the project that the report covers: what an update
	 * reaches (an application, a function, a placed unit), not the functions an application composes.
	 * None on a first placement.
	 */
	templateInstances: AnyRefOrRecord[]
	/**
	 * Set when the consumer started from a level ABOVE the one the template was made for: its content
	 * cannot stay there and lands below, on the levels its placement mappings say.
	 */
	offLevel?: OffLevel
	/**
	 * A fork's report: whether it was given the previous revision of the file (`given`) — an element the project
	 * holds that the newer revision lacks is then removed when the previous revision held it — or not (`absent`):
	 * every such element is listed as the project's own and kept by default, since nothing tells one the newer
	 * revision dropped from one the project added. Absent from the report of another scenario.
	 */
	revisionBase?: 'given' | 'absent'
	/**
	 * The units of an SSD template the report acts on, when the element named comes with the units linked to it by a
	 * reference (a terminal of one on a connectivity node of the other): they are placed and updated together.
	 */
	scopeUnits?: ReportedElement[]
	/** What the report did that the consumer should know of: see {@link ReportWarning}. Absent when nothing. */
	warnings?: ReportWarning[]
	/**
	 * An IED update only: what accepting would change in other IEDs, each with the group bringing it (see
	 * {@link OtherIedImpact}), for a consumer to show before the decision. Absent when none.
	 */
	otherIedImpacts?: OtherIedImpact[]
}

/**
 * `reference-paired-by-name`: a reference of the project (`reference`) paired with the template's (`source`) by the
 * names of what both name, their uuids disagreeing: the project's target carries the placeholder `lineage`, which the
 * consumer lets pair by name (`Resolution.referencesByName: 'placeholders'`).
 */
export type ReportWarning =
	| {
			code: 'reference-paired-by-name'
			reference: AnyRefOrRecord
			source?: AnyRefOrRecord
			lineage: string
	  }
	| {
			/**
			 * A reference paired with the template's among instance references naming the very same thing: such twins
			 * are paired in order, which is right whichever pairs with which, but the file holds the same entry twice.
			 */
			code: 'identical-references-paired-in-order'
			/** The instance's reference. */
			reference: AnyRefOrRecord
			/** The template's reference it paired with. */
			source?: AnyRefOrRecord
	  }
	| {
			/**
			 * An element that is no reference, paired with the template's among instance elements of the very same key
			 * (the same label twice): such twins are paired in order.
			 */
			code: 'identical-elements-paired-in-order'
			/** The instance's element. */
			reference: AnyRefOrRecord
			/** The template's element it paired with. */
			source?: AnyRefOrRecord
	  }
	| {
			/**
			 * A control block naming a data set the update changes whose configuration revision is not raised: its value is
			 * no unsigned 32-bit number (`invalid`), or at its limit (`overflow`). Set it by hand.
			 */
			code: 'conf-rev-not-raised'
			/** The project's control block. */
			reference: AnyRefOrRecord
			value: string
			refusal: 'invalid' | 'overflow'
	  }
	| {
			/**
			 * An IED element paired with the template's by its key: its lineage names nothing the template holds (an IED
			 * file imported again, its uuid-less elements given other uuids). `apply` writes the template element's uuid as
			 * its lineage (a fork keeps its own).
			 */
			code: 'element-paired-by-key'
			/** The instance's element. */
			reference: AnyRefOrRecord
			/** The template's element it paired with. */
			source?: AnyRefOrRecord
			/** The key it paired on: `DiffNode.pairedByKey`. */
			key: string
	  }
	| {
			/**
			 * A reference of what the placement places naming what it does not place (a terminal on a node no file of the
			 * template holds; a reference by uuid, of the frame, a role, a category, a variable or a behaviour description, to
			 * an element the placement leaves out): the reference element is not written. `attribute` is the attribute naming
			 * it (its path, else its uuid), `path` the path it was written with, when one.
			 */
			code: 'reference-not-placed'
			/** The template's reference element. */
			reference: AnyRefOrRecord
			attribute: string
			path?: string
	  }
	| {
			/**
			 * What an application's role refers to that is not placed: a variable applying to nothing the placement places
			 * or lands on, or what a function the application stands on holds no copy of.
			 */
			code: 'satellite-not-placed'
			/** The template's variable or behaviour description: neither it nor the role's reference to it is written. */
			source: AnyRefOrRecord
	  }
	| {
			/**
			 * An IED update only: an application or function of the template's specification holding no LNode of the IED,
			 * of which the IED's level holds several instances (the template placed more than once there): which is the
			 * IED's is not told, none is updated. Update the right one with its own operation.
			 */
			code: 'specification-instance-unresolved'
			/** The template's application or function. */
			source: AnyRefOrRecord
	  }

/**
 * A user's choice on one decision group. Either a plain accept/skip, or an object
 * carrying edited `values` for the primary's editable attributes (applied on accept —
 * e.g. a user-chosen name that overrides the auto-resolved collision value).
 */
export type GroupDecision =
	| 'accept'
	| 'skip'
	| { action: 'accept' | 'skip'; values?: Record<string, string> }

/**
 * The consumer's decisions, keyed by `DecisionGroup.id`. A group absent from the
 * map takes its `suggestedAction` (accept). So an empty map = accept everything.
 */
export type DecisionMap = Map<string, GroupDecision>

/** A matched node of the diff and the instance element it compares: what a rename is numbered among. */
export type RenamedNode = { node: DiffNode; child: AnyTreeRecord }

/** An added node of the diff and the source element it adds: what is compared with the instance's children. */
export type AddedChild = { node: DiffNode; source: AnyTreeRecord }

/** A node of the diff carrying an identity collision, with it. */
export type NodeIdentityCollision = { node: DiffNode; collision: IdentityCollision }

/** The identities of a source node's own references: by the uuids they name, and by the names of their targets. */
export type SourceRefIdentities = { uuids: Set<string>; names: Set<string> }

/** Whether a leftover instance reference is another instance's link, and the placeholder that paired it by name. */
export type MultiInstanceSibling = { sibling: boolean; pairedByName?: string }

/**
 * Provenance decision for a kept-leftover reference child of a shared satellite: `'removed'` when it
 * is a GENUINE removal (its target is in the source's own scope and the source no longer references
 * it), `'keep'` otherwise (another primary's link / indeterminate). See {@link diff}.
 */
export type LeftoverRefPolicy = (instanceChild: AnyTreeRecord) => Promise<'keep' | 'removed'>

/**
 * What the diffs of one update share of their reads, the document unchanged between them (a report): the references
 * naming data an update may delete, by tag, read once whatever the number of instances.
 */
export type DiffReads = { referrersByTag: Map<string, readonly AnyRawRecord[]> }
