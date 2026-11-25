import { defineErrors } from '@dialecte/core'

/**
 * The errors of the SCL dialecte, beside the core catalogue. Each is thrown as a structured
 * error: `key` and `code` identify the situation, `message` is the default wording, and `meta`
 * (listed for each key) says what it is about — a consumer builds its own wording from the key
 * and that data, and falls back to `message` for a key it does not know.
 *
 * `SCL1xxx` — lifecycle: the decisions and mapping choices a consumer passes.
 * `SCL2xxx` — lifecycle: what a template or a project must hold.
 * `SCL3xxx` — dataflow: a signal linked to an element that cannot implement it.
 * `SCL4xxx` — commit checks: a transaction that would leave the store incoherent.
 */
export const SCL_ERRORS = defineErrors({
	/** A mapping choice for a source element the report does not list. `meta: { sourceId }` */
	MAPPING_CHOICE_UNKNOWN: {
		code: 'SCL1001',
		message: 'The choice concerns an element the template does not bring',
	},
	/** A mapping choice for a mapping the instance already carries. `meta: { sourceId, tagName }` */
	MAPPING_CHOICE_LOCKED: {
		code: 'SCL1003',
		message: 'The instance already carries the mapping of this element',
	},
	/**
	 * A mapping choice onto an element that is not a candidate.
	 * `meta: { sourceId, tagName, chosen: { tagName, id } }`
	 */
	MAPPING_CHOICE_NOT_A_CANDIDATE: {
		code: 'SCL1004',
		message: 'The element chosen is not one this element of the template can land on',
	},
	/**
	 * A write was asked while where an element of the template lands is the consumer's to choose.
	 * `meta: { sourceId, tagName, kind: 'level' | 'shared', operation? }`
	 */
	MAPPING_UNDECIDED: {
		code: 'SCL1005',
		message: 'Where an element of the template lands is not decided',
	},
	/** A group is accepted while a group it depends on is skipped. `meta: { groupId, dependencyId }` */
	DECISION_DEPENDENCY_SKIPPED: {
		code: 'SCL1006',
		message: 'A change is accepted while a change it depends on is skipped',
	},
	/** A previous revision is given to an operation that is not a fork. `meta: { scenario }` */
	REVISION_BASE_WITHOUT_FORK: {
		code: 'SCL1007',
		message: 'A previous revision is given to an operation that is not a fork',
	},
	/**
	 * The previous revision given to a fork is another file: its Header names another file than the newer
	 * revision's. `meta: { fileUuid, baseFileUuid }`
	 */
	REVISION_BASE_OTHER_FILE: {
		code: 'SCL1008',
		message: 'The previous revision given is another file',
	},
	/**
	 * An option takes a value the operation does not offer yet, given or by default: an extract writing a new revision
	 * of the file the element came from (`as: 'revision'`), an FSD holding a function of a line or a process at its own
	 * level (`placement: 'source-level'`, the default), a source file of an extension the operation does not read
	 * (`sourceExtension`), an IED report reconciling an IED the project already holds (`scenario`: `template` or
	 * `fork`), an IED read from an IID or an SCD or the IED of an ISD instance file (`source`: `iid`, `scd`,
	 * `isd-instance`). `meta: { option, value }`
	 */
	OPTION_NOT_AVAILABLE: {
		code: 'SCL1009',
		message: 'This value of the option is not available yet',
	},
	/**
	 * An element written beside one of the project that shares with it every field of a key none of which can be
	 * changed (the key of a logical node: its class, instance, prefix, device and IED): two such elements in one place
	 * are invalid, whatever is numbered. `meta: { constraint, fields, element: { tagName, id }, collidesWith: { tagName,
	 * id } }` — `element` is the element the operation brings (as the template holds it when refused before any write,
	 * as written otherwise), `collidesWith` the element of the project.
	 */
	IDENTITY_COLLISION: {
		code: 'SCL1010',
		message: 'An element shares with another one in the same place a key that cannot be changed',
	},
	/** A decision is passed for a group the report does not list. `meta: { groupId }` */
	DECISION_UNKNOWN: {
		code: 'SCL1011',
		message: 'A decision concerns a change the report does not list',
	},
	/** A group of the report depends on a group the report does not list. `meta: { groupId, dependencyId }` */
	DECISION_DEPENDENCY_UNKNOWN: {
		code: 'SCL1012',
		message: 'A change depends on a change the report does not list',
	},
	/**
	 * A report is applied to another target than the one it was made for, or carries none (it was not made by
	 * `query.lifecycle.report`). `meta: { field }` — the first that differs: `report` (none), `document`, `source`,
	 * `verb`, `ref`, `anchor`, `scenario`, `targetInstance`, `fileType` (an IED's: the type of file its source is).
	 */
	REPORT_TARGET_MISMATCH: {
		code: 'SCL1013',
		message: 'The report was made for another target',
	},
	/**
	 * A report names an element the document no longer holds: an instance it covers, an element a mapping lands on,
	 * an element a mapping choice names. `meta: { element: { tagName, id }, kind: 'instance' | 'mapping' }`
	 */
	REPORT_STALE: {
		code: 'SCL1014',
		message: 'The report names an element the document no longer holds',
	},
	/**
	 * A fork on an open ISD document is given a file that is not a version of it: another file (the Headers name
	 * different files, `reason: 'other-file'`, `fileUuid`, `otherFileUuid`), or the same file holding another IED
	 * (`reason: 'other-ied'`, `iedUuid`, `otherIedUuid`). `meta: { reason, ... }`
	 */
	NOT_A_VERSION_OF_FILE: {
		code: 'SCL1015',
		message: 'The file is not a version of the open file',
	},
	/** The template file holds nothing that can be instantiated, or not the element an SSD operation names. */
	TEMPLATE_ROOT_NOT_FOUND: {
		code: 'SCL2001',
		message: 'The template holds nothing that can be instantiated',
	},
	/** The project has no `Header` to record the source file in. */
	TARGET_HEADER_MISSING: {
		code: 'SCL2002',
		message: 'The project has no Header to record the source file in',
	},
	/**
	 * An SSD whose first named level holds several elements to instantiate (a unit, or units linked by a reference), none
	 * of them chosen: the element named is the `TEMPLATE` scaffolding above them, or none is named. The consumer asks
	 * again naming one of them as `ref`.
	 * `meta: { candidates: [{ tagName, id, name, linked }] }` — one per element to instantiate: a unit, as the template
	 * holds it, with the units linked to it by a reference (placed with it).
	 */
	SSD_SCOPE_AMBIGUOUS: {
		code: 'SCL2003',
		message:
			'The template holds several elements to instantiate: the one to act on is to be chosen',
	},
	/**
	 * A function extracted as a function template (an FSD whose function has no parent level) holds what a function
	 * template cannot hold: an element at the function's own level, or categories classifying it, which have no level
	 * to sit at. Nothing is written; the caller leaves those sections out or places the function at a level.
	 * `meta: { tags }` — the elements in question, by tag, sorted.
	 */
	FUNCTION_TEMPLATE_CANNOT_HOLD: {
		code: 'SCL2004',
		message: 'A function template cannot hold what the function holds',
	},
	/** The selected source IED describes an implemented device, not a specification. `meta: { ied }` */
	IED_NOT_SPECIFICATION: {
		code: 'SCL2005',
		message: 'The selected IED is not a specification IED',
	},
	/** The target of an IED extraction already holds an IED or a process part (a substation, line or process). */
	EXTRACTION_TARGET_NOT_EMPTY: {
		code: 'SCL2006',
		message: 'The extraction target already holds an IED or a process part',
	},
	/** An affected extraction control has no valid unsigned 32-bit counter. `meta: { source, value? }` */
	EXTRACTION_CONF_REV_INVALID: {
		code: 'SCL2007',
		message: 'An affected extraction control has an invalid configuration revision',
	},
	/** The extraction increment would exceed the unsigned 32-bit limit. `meta: { source, value }` */
	EXTRACTION_CONF_REV_OVERFLOW: {
		code: 'SCL2008',
		message: 'The extraction configuration revision increment would overflow',
	},
	/**
	 * An SSD template one of whose levels holds several elements named `TEMPLATE` (two `TEMPLATE` substations in the
	 * file, two `TEMPLATE` voltage levels in a substation, two `TEMPLATE` bays in a voltage level): names are unique
	 * among siblings, so the file is not valid and nothing tells which of them to act on. Nothing is written.
	 * `meta: { parent: { tagName, id, name? }, duplicates: [{ tagName, id, name }] }` — the element holding them (the
	 * file's root for substations), and the elements named `TEMPLATE` there, in document order.
	 */
	SSD_TEMPLATE_NOT_UNIQUE: {
		code: 'SCL2009',
		message: 'A level of the template holds several elements named TEMPLATE',
	},
	/**
	 * Decisions given to `apply` that do not name a group the report says waits for one (`requiresDecision`): its
	 * suggested action cannot be written as it is. Nothing is written. `meta: { groupIds }` — every such group left out.
	 */
	DECISION_REQUIRED: {
		code: 'SCL2010',
		message: 'A change waits for a decision the decisions do not give',
	},
	/**
	 * A take-over (`Resolution.takeOver`) naming an element the report does not list as keeping a value the project
	 * may set, itself or below it. `meta: { element: { tagName, id } }` — the first one.
	 */
	TAKE_OVER_NOT_OFFERED: {
		code: 'SCL2011',
		message: 'The element named for a take-over keeps no value that can be taken over',
	},
	/**
	 * An update of an IED the project holds several instances of, `targetInstance` naming none of them: an update changes
	 * the one IED it starts from, never every instance of its template. `meta: { instances: [{ tagName, id }], named?:
	 * { tagName, id } }` — `named` when the consumer named an element that is no instance.
	 */
	TARGET_INSTANCE_REQUIRED: {
		code: 'SCL2012',
		message: 'The update needs the instance it starts from, among those the project holds',
	},
	/**
	 * Building a specification IED's data model from logical nodes breaks a rule: nothing is written.
	 * `meta: { reason, refusals: [{ reason, ref?, detail }] }` — `reason` is the first refusal's; `refusals` lists every
	 * one, each with the element it is about.
	 */
	SPECIFICATION_BUILD_REFUSED: {
		code: 'SCL2013',
		message: 'The specification IED cannot be built from these logical nodes',
	},
	/**
	 * Staging the ISD of a specification built from logical nodes breaks a rule: nothing is written.
	 * `meta: { reason, stage: 'stageIsd', ref? }`: `target-not-empty`, `lnode-outside-process`, `shell-not-specification`,
	 * `no-lnodes`, `ied-name` or `type-missing` (an LNode naming an LNodeType the project lacks, or a logical node of the
	 * shell IED naming one the shell document lacks); `ref` names the element it is about.
	 */
	SPECIFICATION_STAGE_REFUSED: {
		code: 'SCL2014',
		message: 'The ISD of these logical nodes cannot be staged',
	},
	/** The selected source IED describes a specification, not a real device: a CID is written for a real IED. `meta: { ied }` */
	IED_NOT_IMPLEMENTED: {
		code: 'SCL2015',
		message: 'The selected IED is not a real IED',
	},
	/** The selected IED has no network address (no connection of it holds an address): a CID needs one. `meta: { ied }` */
	IED_NOT_CONNECTED: {
		code: 'SCL2016',
		message: 'The selected IED has no network address',
	},
	/**
	 * A signal linked to an element it cannot be implemented by (a `SourceRef` to an `ExtCtrl`).
	 * `meta: { signal: { tagName, id }, implementation: { tagName, id } }`
	 */
	DATAFLOW_LINK_TARGET_MISMATCH: {
		code: 'SCL3001',
		message: 'The signal cannot be implemented by an element of this kind',
	},
	/**
	 * A commit deletes a record and leaves one of its children in the store without a parent: a bug of a hook that
	 * staged a delete without the subtree. `meta: { record: { tagName, id }, child: { tagName, id } }` — the first
	 * pair found.
	 */
	CHILD_LEFT_BEHIND: {
		code: 'SCL4001',
		message: 'The commit deletes a record and leaves one of its children behind',
	},
	/**
	 * A reference holding a uuid whose own names (or, for a `GSE` / `SMV`, its `ConnectedAP`'s IED), or whose path, a
	 * transaction edited to name no element or several: the commit never drops the uuid an edit leaves unconfirmed.
	 * Removing every name of the pair unbinds it instead. `meta: { reference: { tagName, id }, uuidAttribute, address,
	 * resolved: 'none' | 'several' }`.
	 */
	REFERENCE_NAMES_UNRESOLVED: {
		code: 'SCL4002',
		message: 'The names of a reference holding a uuid name no element, or several',
	},
	/**
	 * A transaction moved a subtree holding what references name by its place and a move does not follow yet: an element
	 * a tuple reference names (a logical node, a logical device, an access point, a control block), one that sits only
	 * below a logical node (a data instance, a data set, an input), or a tuple reference that reads its IED from where it
	 * sits and moves away from it (a GOOSE or sampled value address moved to another connected access point, a served
	 * access point). A logical node or a logical device moved within its IED is followed, unless the logical device goes to
	 * an access point with no connection on the subnetwork of an address it sends. A reference naming its IED outright
	 * (an LNode, a connected access point) moves as it is.
	 * `meta: { moved: { tagName, id }, parent: { tagName, id } }` — the first such move, and the parent it was given; the
	 * commit throws the first, `tx.cleanUp.commitPrune({ collect: true })` lists every one (one per move and cause).
	 */
	MOVE_NOT_FOLLOWED: {
		code: 'SCL4003',
		message: 'The moved element is named by references a move does not follow yet',
	},
	/**
	 * A transaction writes a uuid reference (creates it, gives it a uuid, or changes its data names) that cannot be named
	 * coherently: `data-missing`, it holds an LNode uuid without the data object the registry requires beside it;
	 * `groups-together`, a behaviour variable (`InputVar`, `OutputVar`) holds its data group and its input or output group
	 * at once; `out-of-scope`, a behaviour variable names an element its local path cannot reach (not at or below the
	 * level holding its `BehaviorDescription`); `uuid-unresolved`, an existing path reference whose uuid the transaction
	 * changes to one naming no element of the document (a reference created with such a uuid, a copy's among them, is
	 * not refused; a reference named by a tuple is not checked). `meta: { reference: { tagName, id }, uuidAttribute,
	 * reason }`; for `groups-together`, `uuidAttribute` is the uuid attribute of the group the transaction set last in the
	 * registry's order. The commit throws the first, `tx.cleanUp.commitPrune({ collect: true })` lists every one.
	 */
	REFERENCE_INCOHERENT: {
		code: 'SCL4004',
		message: 'A uuid reference the transaction writes cannot be named coherently',
	},
})
