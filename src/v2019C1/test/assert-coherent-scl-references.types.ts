/** One incoherent reference found in a test XML document. */
export type ReferenceViolation =
	| {
			kind: 'path'
			referenceTagName: string
			pathAttribute: string
			uuidAttribute: string
			uuid: string
			/** The path written in the document. */
			written: string
			/** The path of the element the uuid points at. */
			expected: string
	  }
	| { kind: 'dangling'; referenceTagName: string; uuidAttribute: string; uuid: string }
	| {
			kind: 'wrong-target'
			referenceTagName: string
			uuidAttribute: string
			uuid: string
			/** The tag of the element carrying that uuid, which the reference cannot point at. */
			targetTagName: string
	  }
	| { kind: 'empty'; referenceTagName: string; uuidAttribute: string }
	| {
			kind: 'derived'
			elementTagName: string
			/** An attribute written from a path: a terminal's level name, a node's `pathName`. */
			attribute: string
			written: string
			/** Its value read on the path, `undefined` when the path has no such level. */
			expected: string | undefined
	  }

export type CollectReferenceViolationsParams = {
	xml: string
}

export type AssertCoherentSclReferencesParams = {
	xml: string
	/** Names the document in the failure message. */
	label?: string
}

/** A test case as the reference check reads it. */
export type ReferenceCoherenceTestCase = {
	sourceXml: string
	targetXml?: string
	/**
	 * Set when the case NEEDS an incoherent reference (an orphan to clean up, a path to
	 * repair): the reason it does. The case's documents are then left unchecked.
	 */
	allowIncoherentReferences?: string
}

export type AssertCoherentSclReferencesTestCasesParams = {
	testCases: Record<string, ReferenceCoherenceTestCase>
}
