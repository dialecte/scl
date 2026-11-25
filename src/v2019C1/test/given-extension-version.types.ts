/** A given document, as its XML: the role names it in a refusal. */
export type GivenXml = { role: 'source' | 'target'; xml: string }

export type GivenXmlOfParams = { sourceXml: string; targetXml?: string }

export type LacksExtensionVersionParams = { xml: string }

export type AssertGivenExtensionVersionsParams = {
	/** The given documents, as the case wrote them. */
	given: readonly GivenXml[]
	/** Names the case in a refusal. */
	label: string
	/** The reason a given document carries the eIEC61850-6-100 namespace without its version on purpose. */
	noExtensionVersion: string | undefined
}
