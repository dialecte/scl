import type { Scl } from '@/v2019C1/config'

export type OpenSclDocumentParams = {
	/** The test project the document joins: the one `createSclTestProject` or the runner opened. */
	project: Scl.Project
	/** The document, checked as a fixture is before it is imported. */
	xml: string
	/** Names the document in a refusal and in the file name it is imported under. */
	label: string
	/** The reason the document NEEDS an incoherent reference: it is then left unchecked for them. */
	allowIncoherentReferences?: string
}
