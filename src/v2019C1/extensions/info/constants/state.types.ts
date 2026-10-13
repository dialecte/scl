import type { InfoContext } from '../query/info-context.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * A SourceRef / ControlRef: `open` while no source (no controlled data) is given, by path or by
 * uuid, `connected` once one is; `implemented` once the ExtRef / ExtCtrl that implements it is
 * named, which does not depend on the binding.
 */
export type SignalState = {
	binding: 'open' | 'connected'
	implemented: boolean
}

/**
 * An LNode: `locked` once an IED is assigned to it (`iedName` set, not `None`); `mapping` tells
 * what it is bound to: no LN (`unmapped`, also when the binding names an LN the document lacks),
 * an LN of a specification IED, or an LN of a real device's IED.
 */
export type LNodeState = {
	locked: boolean
	mapping: LNodeMapping
}

export type LNodeMapping = 'unmapped' | 'specification-ied' | 'real-ied'

/** The state each tag has; a tag absent here has none. */
export type ElementStateByTag = {
	SourceRef: SignalState
	ControlRef: SignalState
	LNode: LNodeState
}

/** The state of an element of tag `GenericElement`; every state when the tag is not known. */
export type ElementState<GenericElement extends string = string> = string extends GenericElement
	? ElementStateByTag[keyof ElementStateByTag]
	: GenericElement extends keyof ElementStateByTag
		? ElementStateByTag[GenericElement]
		: never

/** What a state rule reads: the element, its own attributes by name, the facts shared by the call. */
export type StateRuleParams = {
	query: Core.Query<Config>
	record: Scl.TrackedRecord<Scl.ElementsOf>
	attributes: Readonly<Record<string, string>>
	context: InfoContext
}
