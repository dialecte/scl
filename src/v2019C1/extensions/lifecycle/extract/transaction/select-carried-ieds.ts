import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { boundIeds } from '@/v2019C1/extensions/lifecycle/ied/bound-ieds'

import type { IedSelection } from './extract.types'
import type {
	CarriedIeds,
	CarriesParams,
	SelectCarriedIedsParams,
} from './select-carried-ieds.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The IEDs an SSD extract of a scope carries: of the IEDs tied to its LNodes (`boundIeds`), those the rule carries (its
 * kind's choice is `carry`, and it is fully assigned to the scope or `shared` is `carry`), or exactly those listed. Every
 * other one is listed as not carried.
 *
 * @throws {@link DialecteError} `EXTRACT_IED_NOT_BOUND` when a listed IED is tied to no LNode the extract writes.
 */
export async function selectCarriedIeds(
	query: Core.Query<Config>,
	params: SelectCarriedIedsParams,
): Promise<CarriedIeds> {
	const { scopeRef, ieds } = params
	const { ieds: bound } = await boundIeds(query, { scopeRef })
	if (isIedList(ieds)) {
		const boundIds = new Set(bound.map((entry) => entry.ied.id))
		const unbound = ieds.find((ied) => !boundIds.has(ied.id))
		if (unbound) {
			throwDialecteError(SCL_ERRORS.EXTRACT_IED_NOT_BOUND, {
				detail: `extract.ssd: IED ${unbound.id} is tied to no LNode of the scope`,
				meta: { ied: unbound },
			})
		}
	}
	const carried = bound.filter(function isCarried(entry) {
		return carries({ selection: ieds, entry })
	})
	const carriedIds = new Set(carried.map((entry) => entry.ied.id))
	const warnings = bound.flatMap(function notCarried(entry): CarriedIeds['warnings'][number][] {
		if (carriedIds.has(entry.ied.id)) return []
		const { ied, name, kind, assignment } = entry
		return [{ code: 'ied-not-carried', ied, name, kind, assignment }]
	})
	return { carried, warnings }
}

/** Whether a selection carries a bound IED. */
function carries(params: CarriesParams): boolean {
	const { selection, entry } = params
	if (isIedList(selection)) return selection.some((ied) => ied.id === entry.ied.id)
	return (
		selection[entry.kind] === 'carry' &&
		(entry.assignment === 'full' || selection.shared === 'carry')
	)
}

/** Whether a selection lists its IEDs. */
function isIedList(
	selection: IedSelection,
): selection is Extract<IedSelection, readonly unknown[]> {
	return Array.isArray(selection)
}
