import type { Scl } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * A behaviour variable the commit wrote without the `lnodeUuid` that only repeated the LNode of its input or output:
 * the variable, the attributes it dropped (that `lnodeUuid`, and a `dataName` naming that LNode alone), the uuid
 * attribute of the reference it keeps, and the LNode that reference reaches, which the dropped `lnodeUuid` named.
 */
export type NormalisedReferenceGroups = {
	element: Scl.Ref<Scl.ElementsOf>
	removed: string[]
	kept: string
	lnode: Scl.Ref<Scl.ElementsOf>
}

/** A behaviour variable whose data group is only an `lnodeUuid`, beside the other group it keeps (`strayLNodeUuidOf`). */
export type StrayLNodeUuid = {
	record: AnyRawRecord
	lnodeUuid: string
	/** The data group's attributes it holds, the path first: what dropping the `lnodeUuid` removes. */
	removed: string[]
	kept: ReferencePair
	targetUuid: string
	/** The data-less `dataName` it holds, when it holds one: it must name the LNode `lnodeUuid` names. */
	dataName?: string
}
