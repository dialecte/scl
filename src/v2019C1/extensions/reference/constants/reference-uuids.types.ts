/**
 * One uuid attribute a referrer names its target by, read from either reference registry: the tags it may point at,
 * and the attributes naming that same target beside it. Those follow the uuid: a uuid pair's path is always written
 * from it (`form: 'path'`); a tuple pair's names are the reference itself when no uuid is written (`form: 'tuple'`).
 */
export type ReferenceUuid = {
	uuid: string
	target: readonly string[]
	names: readonly string[]
	form: 'path' | 'tuple'
}

/** A referrer naming a target by one of its uuid attributes. */
export type UuidReferrer = {
	refTagName: string
	uuidAttr: string
}
