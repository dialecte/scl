import type { Config, Scl } from '@/v2019C1/config'
import type { KeyTaken } from '@/v2019C1/extensions/lifecycle/constraints/judge-key-taken.types'
import type { LifecycleTarget, Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport, ReportedElement } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { CommitRefusal } from '@/v2019C1/hooks/before-commit/commit-plan.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * What a copy writes on one copied element, named by its source element (the copy has no id before it is written), as a
 * difference from the element as the source holds it: the attributes whose value changes, with the value written
 * (`written`), and the attributes the element holds that go (`removed`, sorted by name). An attribute left at its value
 * (an LNode's `lnClass` its specification gives already) is in neither.
 */
export type CopyWrite = {
	element: ReportedElement
	written: Readonly<Record<string, string>>
	removed: readonly string[]
}

/**
 * A copied LNode released from the IED that does not travel with the copy: the LNode itself (unassigned, its naming as
 * its `LNodeSpecNaming` gives it, `lnUuid` removed) when it was bound, its `LNodeSpecNaming` (`sIedName` removed, the
 * logical device kept) when it names a specification IED, and the references of its implementation it holds (each
 * pair's path, uuid and companions removed together).
 */
export type CopyUnbind = {
	lnode: CopyWrite
	specNaming?: CopyWrite
	references: readonly CopyWrite[]
}

export type PlanCopyUnbindsParams = {
	/** The source trees the copy is made of, as the source holds them: the copied root, or the Application and its functions. */
	trees: readonly AnyTreeRecord[]
}

export type WriteCopyUnbindsParams = {
	unbinds: readonly CopyUnbind[]
	/** The clone mappings of the copy: each source element named by the plan to the copy written of it. */
	cloneMappings: readonly Scl.CloneMapping[]
}

export type ListCopyRefusalsParams = {
	/** The document the copy is pasted into: what the reach of a behaviour variable is read from. */
	query: Core.Query<Config>
	/** The source trees the copy is made of, as the source holds them. */
	trees: readonly AnyTreeRecord[]
	/** The unbind plan of the copy: what it clears is no refusal. */
	unbinds: readonly CopyUnbind[]
	/** The parent the copy is pasted under: a behaviour variable's reach is read from there. */
	anchor: Scl.Ref<Scl.ElementsOf>
}

export type AssertCopyFitsParams = {
	/** The document the copy is pasted into. */
	query: Core.Query<Config>
	/** The target of the copy, as `report` and `apply` take it. */
	target: LifecycleTarget & { resolution?: Resolution }
}

/** A record a copy is made of, as the copy writes it, with the tree of the copy it belongs to. */
export type CopiedRecord = { record: AnyRawRecord; root: AnyTreeRecord }

export type DescribeCopyParams = {
	/** The copy reported: an fsd or asd target whose scenario is `copy`. */
	target: Extract<LifecycleTarget, { verb: 'fsd' | 'asd' }>
	/** The report of the copy, told what it copies besides what it places. */
	report: DiffReport
}

/** What a copy's report tells besides what it places: see `describeCopy`. */
export type CopyDescription = {
	unbinds: CopyUnbind[]
	refusals: CommitRefusal[]
	/** The key taken where each root lands, by the id of the group placing it. */
	keysTaken: ReadonlyMap<string, KeyTaken>
}
