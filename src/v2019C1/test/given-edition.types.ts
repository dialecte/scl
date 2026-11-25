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

export type EditionOneRootReasonParams = { editionOneRoot: string | undefined; label: string }
