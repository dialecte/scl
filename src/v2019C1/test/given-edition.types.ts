import type { ROOT_OPT_IN_NEEDS, SCL_EDITION_ATTRIBUTES } from './given-edition.constants'
import type { GatedDocument } from './output-gate.types'

export type AssertGivenEditionsParams = {
	/** The source document a case is given. */
	source: GatedDocument['document']
	/** The target document, when the case has one. */
	target?: GatedDocument['document']
	/** Names the case in a refusal. */
	label: string
	/** The reason a given document is a first-edition file on purpose, its root stating no SCL version. */
	editionOneRoot: string | undefined
}

export type RootEditionParams = {
	/** Names the document in a refusal. */
	role: 'source' | 'target'
	document: GatedDocument['document'] | undefined
}

/**
 * A document's root as its edition reads: the version it states, `''` when none, and the edition attributes it lacks.
 */
export type RootEdition = {
	role: 'source' | 'target'
	version: string
	missing: readonly SclEditionAttribute[]
}

/** An attribute an `SCL` root states its edition by. */
export type SclEditionAttribute = (typeof SCL_EDITION_ATTRIBUTES)[number]

export type MissingSclEditionParams = {
	/** Whether the root states the attribute, as an attribute of its own. */
	states: (name: SclEditionAttribute) => boolean
}

export type RootOptInReasonParams = {
	/** The opt-in, as the case names it. */
	name: keyof typeof ROOT_OPT_IN_NEEDS
	/** Its value: absent when the case does not set it. */
	reason: string | undefined
	label: string
}
