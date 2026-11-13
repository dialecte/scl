import type { IncoherentPathName } from '@/v2019C1/errors/import-diagnostics.types'
import type { SclImportDiagnostic } from '@/v2019C1/errors/import-diagnostics.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { ElementPath } from '@/v2019C1/extensions/reference/query/build'
import type {
	AfterImportContext,
	AfterImportResult,
	AnyRawRecord,
	ImportSession,
} from '@dialecte/core'

/**
 * A reference written with a path: parsed and looked up once the whole file is read, when the
 * naming of every LNode is known. `ancestry` is kept for the strategies whose names are local to
 * the referrer (behaviour description, IED address, ancestor name).
 */
export type PendingResolution = {
	recordId: string
	elementTag: string
	pair: ReferencePair
	pathValue: string
	referenceAttributes: readonly { name: string; value: string }[]
	ancestry?: readonly AnyRawRecord[]
	/** Its uuid when the file gives one: only a path in a former form is then written again. */
	uuidValue?: string
	/**
	 * Written again in the standard form once resolved whatever form it had: a name local to a
	 * BehaviorDescription that names a signal, a ProcessResource named by its full path.
	 */
	alwaysStandardize: boolean
}

/** An element of the file with the ancestors it was read below. */
export type CollectedElement = {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}

/** A target element of the file, indexed by its path once the whole file is read. */
export type CollectedTarget = CollectedElement & {
	uuid: string
}

/** The attributes a patch sets, those it removes, and those the file gave another value. */
export type AttributeChanges = {
	attributes: { name: string; value: string }[]
	removeAttributes: string[]
	incoherent: IncoherentPathName[]
}

/** A target element of the file, indexed by its uuid. */
export type IndexedTarget = {
	/** The id of its record: what a diagnostic naming it points at. */
	recordId: string
	tagName: string
	path: ElementPath
	/** The logical node type a logical node (an LNode, an LN) names: what its data paths are read against. */
	lnType?: string
}

/**
 * A reference stored with its uuid and no path. Everything its path is composed from is kept
 * from the first pass; the path is composed once every target is indexed.
 */
export type PendingPathFill = {
	recordId: string
	elementTag: string
	pair: ReferencePair
	uuidValue: string
	referenceAttributes: readonly { name: string; value: string }[]
	/**
	 * `behavior-description`, `ied-address` and function-scoped pairs only: the referrer's ancestors,
	 * its BehaviorDescription, its LNode or its FunctionRef among them.
	 */
	ancestry?: readonly AnyRawRecord[]
}

/**
 * The path index of the file: the standard path of each target, and the paths an earlier version
 * wrote for it (`legacyKeys`), which still resolve and are written again in the standard form.
 */
export type ImportPathIndex = {
	byPath: Map<string, string>
	legacyKeys: Set<string>
	targetsByUuid: Map<string, IndexedTarget>
}

/**
 * The other paths of the targets of a file, with the uuid each names, in the two tiers they are
 * indexed in: the other names below a target's standard parent, then the paths through an LNode
 * named by its own naming.
 */
export type OtherPaths = {
	underStandardParent: [path: string, uuid: string][]
	underOwnNaming: [path: string, uuid: string][]
}

/**
 * The import session of one SCL file. Its `afterImport` tells its steps through the context core hands it; given
 * none (a caller of the zero-argument form), it runs the same and tells nothing.
 */
export type SclImportSession = Omit<ImportSession<SclImportDiagnostic>, 'afterImport'> & {
	afterImport(context?: AfterImportContext): Promise<AfterImportResult<SclImportDiagnostic>>
}

/**
 * One unit of the path index's work: a target under its standard path, a target under the name it is read by in its
 * scope, or the other paths of every target (once, last).
 */
export type ImportPathIndexUnit =
	| { pass: 'standard-path' | 'scoped-name'; target: CollectedTarget }
	| { pass: 'other-paths' }

/** The path index of a file built one unit at a time (`createImportPathIndexBuilder`). */
export type ImportPathIndexBuilder = {
	/** The index being built: complete once every unit of `units()` is built, in order */
	index: ImportPathIndex
	/** How many units `units()` gives: twice the targets, plus one */
	total: number
	/** The units, in the order they are built */
	units(): Iterable<ImportPathIndexUnit>
	/** Build one unit */
	build(unit: ImportPathIndexUnit): void
}
