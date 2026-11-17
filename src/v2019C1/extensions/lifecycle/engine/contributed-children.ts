/** Whether a contribution brings a child of a container the project holds: unless told otherwise for its tag, yes. */
export function contributesChild(params: {
	parentTag: string
	childTag: string
	contributedChildren: ReadonlyMap<string, ReadonlySet<string>> | undefined
}): boolean {
	const contributed = params.contributedChildren?.get(params.parentTag)
	return !contributed || contributed.has(params.childTag)
}
