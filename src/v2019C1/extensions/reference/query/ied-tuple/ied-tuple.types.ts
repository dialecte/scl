import type { TupleReferencePair, TupleRole } from '@/v2019C1/constants/reference-pairs.types'

/** What a tuple reference points at: a logical node, a logical device, an access point, a control block. */
export type TupleTargetKind = 'ln' | 'ld' | 'ap' | 'cb'

/** The parts of an IED-section element's tuple address, as its element and ancestors name them. */
export type TupleTargetParts = { kind: TupleTargetKind; ied: string } & {
	[Role in TupleRole]?: string
}

/**
 * What a tuple reference writes: attributes (`undefined` removes one), and its text when its text names
 * the IED.
 */
export type TupleReferenceWrite = {
	attributes: Record<string, string | undefined>
	value: string | undefined
}

/** A tuple reference naming a logical node by an attribute holding its IED, its logical device and its class. */
export type LogicalNodeTuplePair = TupleReferencePair & {
	tuple: { ied: { attribute: string }; lDevice: string; lnClass: string }
}

/** A tuple reference naming a control block, whose service attribute tells the kind of control block. */
export type ControlBlockTuplePair = TupleReferencePair & {
	targetByAttribute: NonNullable<TupleReferencePair['targetByAttribute']>
	tuple: { controlBlock: string }
}
