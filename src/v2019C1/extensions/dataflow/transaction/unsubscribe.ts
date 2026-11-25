import { companionsIn } from '../query/companions-of'
import { createDataflowContext } from '../query/dataflow-context'
import { describeDocument } from '../query/describe-document'
import { isFixed, planSubscriptionBookkeeping } from '../query/plan-subscription-bookkeeping'
import { signalsByElement } from '../query/signals-by-element'
import { unlink } from './unlink'

import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { inputSourceEffect } from '@/v2019C1/hooks/shared/input-source'

import type { DataflowContext } from '../query/dataflow-context.types'
import type { IedNode } from '../query/ied-section.types'
import type {
	UnsubscribeParams,
	UnsubscribeRefusalMeta,
	UnsubscribeResult,
} from './unsubscribe.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Transaction extension: ends the subscriptions of ExtRefs, with the ExtRefs implementing the same data object signal
 * unless `withCompanions: false`. An ExtRef holding an internal address is kept, its binding and service cleared (the
 * delete cascade's rule), and the signal it implemented unlinked; one holding none is removed. Each registration
 * (`IEDName`, `ClientLN`) and supervision value (`setSrcRef`) no ExtRef of its subscriber uses any more goes, as
 * `planSubscriptionBookkeeping` plans it. Refused, nothing written, when the IED of an ExtRef has the engineering right
 * `fix`.
 *
 * @intent unsubscribe an ExtRef, end a GOOSE/SV/report subscription, remove an IEDName or ClientLN no ExtRef uses
 */
export async function unsubscribe(
	tx: Core.Transaction<Config>,
	params: UnsubscribeParams,
): Promise<UnsubscribeResult> {
	const { extRefs: refs, withCompanions = true } = params
	const context = createDataflowContext(tx)
	const given = await readGiven({ context, refs })
	const dataflows = await describeDocument({ context })
	const signalOf = signalsByElement({ dataflows })
	const ending = withCompanions ? await withCompanionsOf({ context, given, signalOf }) : given
	const bookkeeping = await planSubscriptionBookkeeping({ context, ending })

	const result: UnsubscribeResult = {
		unbound: [],
		removed: [],
		unlinked: [],
		registrations: bookkeeping.registrations,
		supervisions: bookkeeping.supervisions.map(({ dai }) => dai),
		kept: bookkeeping.kept,
	}
	for (const extRef of ending) {
		const effect = inputSourceEffect({ record: extRef.record, scope: 'data' })
		if (effect.effect === 'deleted') {
			await tx.delete(extRef.ref)
			result.removed.push(extRef.ref)
			continue
		}
		await tx.any.update(extRef.ref, { attributes: removedAttributes(effect.attributes) })
		result.unbound.push(extRef.ref)
		const signal = signalOf.get(extRef.record.id)
		if (signal?.tagName === 'SourceRef') {
			await unlink(tx, { signal })
			result.unlinked.push(signal as Scl.Ref<'SourceRef'>)
		}
	}
	for (const operation of bookkeeping.registrations) {
		if (operation.effect === 'deleted') await tx.delete(operation.element)
		else
			await tx.any.update(operation.element, {
				attributes: removedAttributes(operation.attributes),
			})
	}
	for (const { val } of bookkeeping.supervisions) await tx.delete(val)
	return result
}

/** The ExtRefs given, each once, as the IED section holds them; refused when one is in an IED whose engineering right is `fix`. */
async function readGiven(params: {
	context: DataflowContext
	refs: readonly Scl.Ref<'ExtRef'>[]
}): Promise<IedNode<'ExtRef'>[]> {
	const { context, refs } = params
	const { extRefs } = await context.iedSection()
	const byId = new Map(extRefs.map((extRef) => [extRef.record.id, extRef]))
	const once = [...new Map(refs.map((ref) => [ref.id, ref])).values()]
	return once.map(function readOne(ref) {
		const extRef = byId.get(ref.id)
		invariant(extRef, {
			key: 'ELEMENT_NOT_FOUND',
			ref,
			detail: `the <ExtRef> "${ref.id}" is not an input of an IED`,
		})
		const meta: UnsubscribeRefusalMeta = { reason: 'eng-right-fix', ied: extRef.ied }
		invariant(!isFixed({ ancestry: extRef.ancestry }), {
			key: SCL_ERRORS.DATAFLOW_UNSUBSCRIBE_REFUSED,
			meta,
			detail: `the <IED> "${extRef.ied.id}" holding the <ExtRef> "${ref.id}" has the engineering right fix`,
		})
		return extRef
	})
}

/** The ExtRefs given and their companions, each once, the given ones first. */
async function withCompanionsOf(params: {
	context: DataflowContext
	given: readonly IedNode<'ExtRef'>[]
	signalOf: ReadonlyMap<string, Scl.Ref<'SourceRef' | 'ControlRef'>>
}): Promise<IedNode<'ExtRef'>[]> {
	const { context, given, signalOf } = params
	const { extRefs } = await context.iedSection()
	const byLogicalNode = Map.groupBy(extRefs, (extRef) => extRef.ln?.id)
	const ending = new Map(given.map((extRef) => [extRef.record.id, extRef]))
	for (const extRef of given) {
		const inLogicalNode = byLogicalNode.get(extRef.ln?.id) ?? []
		const companions = await companionsIn({ context, extRef, inLogicalNode, signalOf })
		for (const companion of companions) {
			if (!ending.has(companion.record.id)) ending.set(companion.record.id, companion)
		}
	}
	return [...ending.values()]
}

/** The attributes given, each removed: `update` removes an attribute given `undefined`. */
function removedAttributes(names: readonly string[]): Record<string, string> {
	// the untyped surface takes string values only
	const removed: Record<string, string | undefined> = Object.fromEntries(
		names.map((name) => [name, undefined]),
	)
	return removed as Record<string, string>
}
