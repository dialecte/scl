import { FUNCTION_TEMPLATE_TAG, TO_IMPLEMENT_REASON } from './to-implement.constants'

import { throwDialecteError } from '@dialecte/core'

import { readProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section'
import { classifyIeds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { readSpecNamings } from '@/v2019C1/extensions/reference/query/build/read-spec-namings'
import { readImplementations } from '@/v2019C1/extensions/reference/query/resolve/read-implementations'
import { readAttributes } from '@/v2019C1/helpers'

import type { ToImplement, ToImplementParams, ToImplementReason } from './to-implement.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What is still to implement on a real IED: the specification IED names of the LNodes it implements (the `sIedName` of
 * their `LNodeSpecNaming`, which keeps the specification once an LNode is mapped), and every LNode of the process
 * section specified on one of those names that no real IED implements yet. An LNode mapped to a specification IED is
 * still to implement: it is specified, not implemented. Implemented counts every real IED, an LNode implemented with
 * others by one logical node (its data naming the LN) included. The other real IEDs implementing LNodes specified on
 * those names are listed: when one specification IED is implemented by several real IEDs, nothing says which of them
 * an LNode left is meant for, so it is listed for each.
 *
 * A specification IED answers `reason: 'not-implemented-ied'`; an IED whose LNodes carry no specification IED name
 * answers `reason: 'no-specification-name'` (never guessed from its own name); both with empty lists. Refuses with
 * `ELEMENT_NOT_FOUND` when the document holds no such IED. A fixed number of reads; nothing is kept after the call.
 *
 * @intent what is still to implement on a real IED, the logical nodes left of the specification a real device implements
 *
 * @example
 * const { specifiedAs, lnodes } = await doc.query.specification.toImplement({ ied })
 * // specifiedAs → ['S1'], lnodes → the LNodes specified on S1 no real IED implements yet
 */
export async function toImplement(
	query: Core.Query<Config>,
	params: ToImplementParams,
): Promise<ToImplement> {
	const { ied } = params
	const section = await readProcessSection(query)
	const lnodes = [...section.lnodes.values()]
		.filter((node) => !node.ancestry.some((ancestor) => ancestor.tagName === FUNCTION_TEMPLATE_TAG))
		.map((node) => node.record as Scl.TrackedRecord<'LNode'>)
	const classifications = await classifyIeds(query)
	const { byLNode, ieds } = await readImplementations(query, { lnodes, classifications })
	const asked = ieds.find((entry) => entry.ied.id === ied.id)
	if (!asked) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: ied,
			detail: `the document holds no <IED> "${ied.id}"`,
		})
	}
	if (asked.kind !== 'implemented')
		return emptyBecause({ reason: TO_IMPLEMENT_REASON.notImplementedIed })

	const namings = await readSpecNamings(query, { lnodes })
	const specifiedOn = lnodes.map(function sIedNameOf(_lnode, position) {
		const naming = namings[position]
		return naming
			? readAttributes({ record: naming, defaults: 'none' }).sIedName || undefined
			: undefined
	})
	const specifiedAs = new Set(
		lnodes.flatMap((lnode, position) => {
			const name = specifiedOn[position]
			return name && byLNode.get(lnode.id)?.ied.id === ied.id ? [name] : []
		}),
	)
	if (specifiedAs.size === 0)
		return emptyBecause({ reason: TO_IMPLEMENT_REASON.noSpecificationName })

	const candidates = lnodes.filter((_lnode, position) =>
		specifiedAs.has(specifiedOn[position] ?? ''),
	)
	const implementerIds = new Set(
		candidates.flatMap((lnode) => {
			const implementation = byLNode.get(lnode.id)
			return implementation?.kind === 'implemented' ? [implementation.ied.id] : []
		}),
	)
	return {
		specifiedAs: [...specifiedAs].sort(),
		lnodes: candidates
			.filter((lnode) => byLNode.get(lnode.id)?.kind !== 'implemented')
			.map((lnode) => ({ tagName: 'LNode' as const, id: lnode.id })),
		otherImplementers: ieds
			.filter((entry) => entry.ied.id !== ied.id && implementerIds.has(entry.ied.id))
			.map((entry) => ({ ied: entry.ied, name: entry.name })),
	}
}

function emptyBecause(params: { reason: ToImplementReason }): ToImplement {
	return { specifiedAs: [], lnodes: [], otherImplementers: [], reason: params.reason }
}
