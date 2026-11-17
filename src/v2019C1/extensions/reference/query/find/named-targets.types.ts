/** A uuid a referrer names, with the tags it may point at and the form of the reference writing it. */
export type NamedTarget = {
	uuid: string
	target: readonly string[]
	form: 'path' | 'tuple'
	/** Its names only follow the uuid (an LNode's binding): the binding rules own it. */
	followsOnly: boolean
}
