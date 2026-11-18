import type { Config } from '@/v2019C1/config'
import type { InputSourceEffect, InputSourceScope } from '@/v2019C1/hooks/shared/input-source.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * A reference of the project (`FCDA`, `ExtRef`) naming data a newer template deletes, with what of it the deletion
 * takes (`scope`: its whole source, `data`, or only the control block sending it) and what that does to it (`effect`:
 * an entry goes; an input's source attributes are cleared, or the input goes when it holds no internal address).
 * `deletedBy` is the project element whose removal or type change deletes the data: the decision on it waits for this
 * one.
 */
export type DeletedDataReferrer = {
	referrer: AnyRawRecord
	scope: InputSourceScope
	effect: InputSourceEffect
	deletedBy: string
}

/** The project elements an update deletes data of, by the uuid a reference names them by: the element's own id. */
export type DeletedTargets = {
	/** Logical nodes and control blocks the update removes, with what holds them. */
	removed: ReadonlyMap<string, string>
	/** Logical nodes whose type the update changes: the template's type of each. */
	retyped: ReadonlyMap<string, { deletedBy: string; templateType: string }>
	/** Every element of the subtrees the update removes, by id: a reference among them goes with them. */
	removedIds: ReadonlySet<string>
}

/** A reader of the project: the report's query, or the apply's transaction. */
export type DocumentReader = Core.Query<Config> | Core.Transaction<Config>
