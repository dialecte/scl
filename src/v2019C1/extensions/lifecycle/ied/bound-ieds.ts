import { classifyIeds } from './classify-ieds'

import { toRef } from '@dialecte/core/helpers'

import { SPECIFIED_IED_NAME_ATTRIBUTE } from '@/v2019C1/constants/lnode-spec-naming'
import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { readCarriedLNodes } from '@/v2019C1/extensions/lifecycle/layers/topology/read-carried-lnodes'
import { readSpecNamings } from '@/v2019C1/extensions/reference/query/build/read-spec-namings'
import { readImplementations } from '@/v2019C1/extensions/reference/query/resolve/read-implementations'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	BoundIed,
	BoundIeds,
	BoundIedsParams,
	BoundLNodes,
	FoldBoundIedsParams,
	LNodeTie,
	SideOfParams,
} from './bound-ieds.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The IEDs tied to the LNodes an SSD extract of a Substation, VoltageLevel or Bay writes (what the scope holds, the own
 * content of the levels above it, and what the functions its applications compose hold, wherever they sit), in document
 * order. An LNode is tied to the IED that
 * implements it (its LN named by its `lnUuid`, else its name path, else, for an unassigned LNode, by the
 * `mappedLnUuid` of its data) and to the IED its specified naming names (`LNodeSpecNaming@sIedName`) when that IED
 * does not implement it (an LNode implemented by the IED it is specified on is listed once, as implemented; a name
 * several IEDs carry specifies nothing). Each IED has
 * its kind (`classifyIeds`), the LNodes on each side of the scope, and is `full` when the extract writes every LNode
 * tied to it, `shared` when it does not. An IED tied to no LNode the extract writes is not listed. A fixed number of
 * reads, whatever the number of LNodes and IEDs; nothing is kept after the call.
 *
 * @intent which IEDs a bay brings, shared IED of a scope, IEDs bound to an extract scope, is an IED fully assigned to a bay or shared with other bays
 *
 * @example
 * const { ieds } = await doc.query.lifecycle.boundIeds({ scopeRef: { tagName: 'Bay', id: bayId } })
 * ieds.filter((entry) => entry.kind === 'specification' && entry.assignment === 'full') // the S-IEDs the bay alone uses
 */
export async function boundIeds(
	query: Core.Query<Config>,
	params: BoundIedsParams,
): Promise<BoundIeds> {
	const { lnodes, carried } = await readCarriedLNodes(query, { scopeRef: params.scopeRef })
	const classifications = await classifyIeds(query)
	const { byLNode } = await readImplementations(query, { lnodes, classifications })
	const namings = await readSpecNamings(query, { lnodes })
	const specifiedOn = lnodes.map(function specifiedIedName(_lnode, position) {
		const naming = namings[position]
		return naming
			? readAttribute({ record: naming, name: SPECIFIED_IED_NAME_ATTRIBUTE, defaults: 'none' })
			: undefined
	})
	const ties = lnodes.map(function tiesOf(lnode, position): LNodeTie {
		return {
			lnode: toRef(lnode) as Scl.Ref<'LNode'>,
			implementer: byLNode.get(lnode.id)?.ied.id,
			specifiedOn: specifiedOn[position],
		}
	})
	return { ieds: foldBoundIeds({ ties, carried, classifications }) }
}

/**
 * Each IED of the document tied to an LNode the extract writes, with the LNodes on each side: an LNode counts once per
 * IED, as implemented by it, else as specified on it (the one IED of the name its specified naming gives; a name
 * several IEDs carry, or "None", specifies nothing). The ties are grouped once, by implementer and by specified name.
 */
function foldBoundIeds(params: FoldBoundIedsParams): BoundIed[] {
	const { ties, carried, classifications } = params
	const countByName = Map.groupBy(classifications, (classification) => classification.name)
	const implementedBy = Map.groupBy(
		ties.filter((tie) => tie.implementer !== undefined),
		(tie) => tie.implementer as string,
	)
	const specifiedBy = Map.groupBy(
		ties.filter((tie) => isAssignedToIed({ iedName: tie.specifiedOn })),
		(tie) => tie.specifiedOn as string,
	)
	return classifications.flatMap(function boundOf(classification): BoundIed[] {
		const { id } = classification.ied
		const named = countByName.get(classification.name)?.length === 1
		const implemented = implementedBy.get(id) ?? []
		const specified = named
			? (specifiedBy.get(classification.name) ?? []).filter((tie) => tie.implementer !== id)
			: []
		const inside = sideOf({ implemented, specified, keep: (tie) => carried.has(tie.lnode.id) })
		if (inside.implements.length === 0 && inside.specifies.length === 0) return []
		const outside = sideOf({ implemented, specified, keep: (tie) => !carried.has(tie.lnode.id) })
		const shared = outside.implements.length > 0 || outside.specifies.length > 0
		return [{ ...classification, assignment: shared ? 'shared' : 'full', inside, outside }]
	})
}

/** The LNodes of one side of the scope an IED implements, and those specified on it that it does not implement. */
function sideOf(params: SideOfParams): BoundLNodes {
	const { implemented, specified, keep } = params
	return {
		implements: implemented.filter(keep).map((tie) => tie.lnode),
		specifies: specified.filter(keep).map((tie) => tie.lnode),
	}
}
