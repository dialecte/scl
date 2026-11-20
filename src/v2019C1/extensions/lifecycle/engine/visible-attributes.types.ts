/**
 * In a fork, the references the newer revision re-targets: the uuids its references name that the fork holds (the open
 * document's, or what the update brings), and which side of a comparison is the newer revision's.
 */
export type ReferenceRetargets = {
	uuids: ReadonlySet<string>
	sourceIs: 'attributes' | 'counterpart'
}

/** An element's tag, its attributes and its counterpart's, and the fork's re-targets. */
export type ReferenceAttributesLeftOutParams = {
	tagName: string
	attributes: Readonly<Record<string, string | undefined>>
	counterpartAttributes: Readonly<Record<string, string | undefined>>
	retargets: ReferenceRetargets | undefined
}

/** One reference's uuid attribute, both sides' attributes, and the fork's re-targets. */
export type IsRetargetedParams = {
	uuid: string
	attributes: Readonly<Record<string, string | undefined>>
	counterpartAttributes: Readonly<Record<string, string | undefined>>
	retargets: ReferenceRetargets
}
