export type ExtractionStrategy =
	| { type: 'transparent' }
	| { type: 'name'; separator?: '/' | '.' }
	| { type: 'lnClass' }
	| LNodeStrategy
	| { type: 'attribute'; attr: string; separator: '/' | '.' }
	| SignalStrategy

/**
 * A signal of an LNode (`SourceRef`, `ControlRef`), named among the signals of that LNode: the plain
 * `name` attribute while it is unique among its siblings; once it is not, `name(instance)`, then
 * `.data` when that attribute is set. Its segment therefore depends on its siblings.
 */
export type SignalStrategy = {
	type: 'signal'
	name: string
	instance: string
	data?: string
}

/**
 * A process-section LNode. While no IED is assigned to it (`ied` unset or `None`), it is named by
 * its own attributes, which are the naming it is specified with. Once one is, binding writes the
 * IED's naming on the LNode: it is named by its `LNodeSpecNaming` (`sPrefix`, `sLnClass`,
 * `sLnInst`), so the paths through it do not change; by its own attributes when it has none.
 */
export type LNodeStrategy = {
	type: 'lnode'
	prefix: string
	lnClass: string
	inst: string
	ied: string
}
