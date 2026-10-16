import type { SectionNode } from './section-node.types'
import type { Scl } from '@/v2019C1/config'

/** An element of the IED section, with the IED, logical device and logical node holding it. */
export type IedNode<GenericElement extends Scl.ElementsOf = Scl.ElementsOf> =
	SectionNode<GenericElement> & {
		ied: Scl.Ref<'IED'>
		ldevice: Scl.Ref<'LDevice'> | undefined
		ln: Scl.Ref<'LN' | 'LN0'> | undefined
	}

/** A control block, with the elements registering a subscriber on it. */
export type ControlBlockNode = IedNode<'GSEControl' | 'SampledValueControl' | 'ReportControl'> & {
	registrations: readonly IedNode<'IEDName' | 'ClientLN'>[]
}

/**
 * What one read of the IED section (every IED down to its logical nodes, their ExtRefs, ExtCtrls and
 * control blocks) gives: every ExtRef in document order, the ExtRefs and ExtCtrls by uuid and by path, the control blocks by uuid and by address, the logical
 * nodes by path and the IED of each, by logical node id.
 */
export type IedSection = {
	extRefs: readonly IedNode<'ExtRef'>[]
	/** Every ExtRef and ExtCtrl, by id. */
	implementations: ReadonlyMap<string, IedNode<'ExtRef' | 'ExtCtrl'>>
	/** The uuids of the access points of each IED, by IED id. */
	accessPointUuidsByIed: ReadonlyMap<string, ReadonlySet<string>>
	/** The uuid of each access point, logical device and logical node that has one, by id. */
	uuidById: ReadonlyMap<string, string>
	/** The logical nodes by uuid and by tuple address (a logical node held by an access point has none). */
	lnsByUuid: ReadonlyMap<string, IedNode<'LN' | 'LN0'>>
	lnsByAddress: ReadonlyMap<string, IedNode<'LN' | 'LN0'>>
	/** Every IED, by name. */
	iedByName: ReadonlyMap<string, Scl.Ref<'IED'>>
	extRefsByUuid: ReadonlyMap<string, IedNode<'ExtRef'>>
	/** Every ExtRef of a path: several may share an internal address. */
	extRefsByPath: ReadonlyMap<string, readonly IedNode<'ExtRef'>[]>
	extCtrlsByUuid: ReadonlyMap<string, IedNode<'ExtCtrl'>>
	extCtrlsByPath: ReadonlyMap<string, readonly IedNode<'ExtCtrl'>[]>
	/** Every control block, by id, in document order. */
	controlBlocks: ReadonlyMap<string, ControlBlockNode>
	controlBlocksByUuid: ReadonlyMap<string, ControlBlockNode>
	/** By `targetKey` of the tuple address and the tag. */
	controlBlocksByAddress: ReadonlyMap<string, ControlBlockNode>
	lnsByPath: ReadonlyMap<string, IedNode<'LN' | 'LN0'>>
	iedOfLn: ReadonlyMap<string, Scl.Ref<'IED'>>
}
