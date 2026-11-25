import type {
	REFERENCE_ACTIONS,
	REFERENCE_CLASSES,
	REFERENCE_FAMILIES,
	REFERENCE_HOLDER_TAGS,
} from './reference-closure.constants'
import type { Config, Scl } from '@/v2019C1/config'
import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type { RecordEdit } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
import type * as Core from '@dialecte/core'

/**
 * An IED that travels with the file or the copy: with its whole subtree (`'whole'`: its references are classified and cut),
 * or cut to an interface by the closure (`'interface'`: it counts as inside, its own references are left out by the closure,
 * never read here); an interface root names the uuids and the control blocks it keeps.
 */
export type ClosureRoot =
	| { ref: Scl.Ref<'IED'>; depth: 'whole' }
	| {
			ref: Scl.Ref<'IED'>
			depth: 'interface'
			/** The uuids of the logical nodes and control blocks it keeps. */
			uuids: ReadonlySet<string>
			/** The control blocks it keeps (record ids): a supervision of one is inside. */
			controlBlocks: ReadonlySet<string>
	  }

/** Where a reference's target is: in the closure, outside it but in the destination, or nowhere the result lands. */
export type ReferenceClass = (typeof REFERENCE_CLASSES)[number]

/** The kind of reference, read from what holds it. */
export type ReferenceFamily = (typeof REFERENCE_FAMILIES)[number]

/**
 * What is done with a reference: written as it is (`'keep'`), written and listed (`'keep-listed'`), reduced to the only form a
 * system tool may write (`'reduce'`: an input without internal address left out, any other input or output written without
 * its source), or its holder left out (`'remove'`: never an input with an internal address, never an output).
 */
export type ReferenceAction = (typeof REFERENCE_ACTIONS)[number]

/** The action per family and class a caller asks for; the standard's limits still apply (see `planReferences`). */
export type ReferencePolicy = Readonly<
	Record<ReferenceFamily, Readonly<Record<ReferenceClass, ReferenceAction>>>
>

/** One reference a written record makes, classified before any action. */
export type ClassifiedReference = {
	holder: Scl.Ref<Scl.ElementsOf>
	family: ReferenceFamily
	direction: 'outgoing' | 'incoming'
	class: ReferenceClass
	/** The IED the reference names, when it names one by name. */
	iedName?: string
	/** The reference value a supervision holds, for a supervision. */
	reference?: string
	action: ReferenceAction
}

/** What `planReferences` reads. */
export type PlanReferencesParams = {
	roots: readonly ClosureRoot[]
	sourceQuery: Core.Query<Config>
	/** Where `present` is judged: the document the result lands in (an export's empty target, a copy's destination). */
	destinationQuery: Core.Query<Config>
	policy: ReferencePolicy
}

/** What a reference cut decides: the classes, the records left out, the attribute edits and what it says. */
export type ReferencePlan = {
	references: readonly ClassifiedReference[]
	leaveOut: ReadonlySet<string>
	edits: readonly RecordEdit[]
	warnings: readonly ExtractWarning[]
}

/** The records of an IED a cut reads, by tag. */
export type HolderRecords = {
	readonly [Tag in (typeof REFERENCE_HOLDER_TAGS)[number]]: readonly Scl.RawRecord<Tag>[]
}

/** What the classifier knows of where a reference may land. */
export type Landing = {
	/** The names of the IEDs the closure holds. */
	insideIeds: ReadonlySet<string>
	/** The names of the IEDs of the destination outside the closure. */
	presentIeds: ReadonlySet<string>
	/** The uuids of the logical nodes and control blocks the closure holds. */
	insideUuids: ReadonlySet<string>
	/** The uuids of the logical nodes and control blocks of the destination outside the closure. */
	presentUuids: ReadonlySet<string>
}

/** One decision of the cut, before it becomes edits, left-out records and warnings. */
export type Decision = ClassifiedReference & { record: Core.AnyRawRecord }
