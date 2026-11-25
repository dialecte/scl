import type { ROOT_OPT_IN_NEEDS } from './given-edition.constants'
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

export type RootVersionParams = { document: GatedDocument['document'] | undefined }

export type RootOptInReasonParams = {
	/** The opt-in, as the case names it. */
	name: keyof typeof ROOT_OPT_IN_NEEDS
	/** Its value: absent when the case does not set it. */
	reason: string | undefined
	label: string
}
