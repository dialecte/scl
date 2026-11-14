/** An LNode a release is planned for: its id, its own attributes and those of its `LNodeSpecNaming`. */
export type ReleasedLNode = {
	id: string
	lnodeAttributes: Readonly<Record<string, string | undefined>>
	specifiedAttributes: Readonly<Record<string, string | undefined>> | undefined
}
