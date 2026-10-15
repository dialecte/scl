import type { Scl } from '@/v2019C1/config'

/**
 * Where a tuple reference reads the name of the IED it points into: one of its own attributes, its
 * text, the IED it sits in, or an attribute of its parent.
 */
export type IedRole<Name extends string = string> =
	| { attribute: Name }
	| { text: true }
	| { ancestor: true }
	| { parentAttribute: string }

/** The attributes of a tuple reference naming each part of its target's address. */
export type TupleRoles<Name extends string = string> = {
	ied: IedRole<Name>
	lDevice?: Name
	prefix?: Name
	lnClass?: Name
	lnInst?: Name
	accessPoint?: Name
	controlBlock?: Name
}

/** A part of a tuple address a reference names with one of its attributes, beside its IED. */
export type TupleRole = Exclude<keyof TupleRoles, 'ied'>

/**
 * A reference that names its target by several attributes (a tuple) beside one uuid attribute. It
 * applies only while none of `onlyWithout` is set on the referrer.
 */
export type TupleReferencePair<Name extends string = string> = {
	attribute: { uuid: Name }
	target: readonly string[]
	tuple: TupleRoles<Name>
	onlyWithout?: readonly Name[]
	/** For a role the referrer leaves out, the attribute naming that part instead. */
	otherwise?: { [Role in TupleRole]?: Name }
	/** Which of the `target` tags an attribute's value names, when several may answer one address. */
	targetByAttribute?: { attribute: Name; tags: Readonly<Record<string, string>> }
}

/**
 * Authoring shape of the tuple references: keyed by the referrer tag, every attribute it names is
 * an attribute of that tag, every target an SCL element — a typo fails to compile.
 */
export type TupleReferencePairsShape = {
	[Tag in Scl.ElementsOf]?: readonly (Omit<
		TupleReferencePair<Scl.AttributesOf<Tag> & string>,
		'target' | 'targetByAttribute'
	> & {
		target: readonly Scl.ElementsOf[]
		targetByAttribute?: {
			attribute: Scl.AttributesOf<Tag> & string
			tags: Readonly<Record<string, Scl.ElementsOf>>
		}
	})[]
}
