import { DATA_OBJECT_ATTRIBUTE } from './companions-of.constants'
import { createDataflowContext } from './dataflow-context'
import { describeDocument } from './describe-document'
import { resolveControlBlock } from './resolve-control-block'
import { resolveSignalLogicalNode } from './resolve-signal-logical-node'
import { signalsByElement } from './signals-by-element'

import { invariant } from '@dialecte/core/utils'

import { readAttribute } from '@/v2019C1/helpers'

import type { CompanionsOfParams, CompanionsParams } from './companions-of.types'
import type { IedNode } from './ied-section.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: the other ExtRefs implementing the same data object level signal as the one given: in its logical
 * node, naming the same publisher logical node, data object and control block, and linked to no other signal. None
 * while the one given names no control block or no publisher logical node.
 *
 * @intent the ExtRefs implementing the same data object signal, the stVal and q companions of an ExtRef
 */
export async function companionsOf(
	query: Core.Query<Config>,
	params: CompanionsOfParams,
): Promise<Scl.Ref<'ExtRef'>[]> {
	const { extRef: ref } = params
	const context = createDataflowContext(query)
	const { extRefs } = await context.iedSection()
	const extRef = extRefs.find((node) => node.record.id === ref.id)
	invariant(extRef, {
		key: 'ELEMENT_NOT_FOUND',
		ref,
		detail: `the <ExtRef> "${ref.id}" is not an input of an IED`,
	})
	const dataflows = await describeDocument({ context })
	const signalOf = signalsByElement({ dataflows })
	const inLogicalNode = extRefs.filter((node) => node.ln?.id === extRef.ln?.id)
	const companions = await companionsIn({ context, extRef, inLogicalNode, signalOf })
	return companions.map((companion) => companion.ref)
}

/** The companions of an ExtRef among the ExtRefs of its logical node (see {@link companionsOf}), in document order. */
export async function companionsIn(params: CompanionsParams): Promise<IedNode<'ExtRef'>[]> {
	const { context, extRef, inLogicalNode, signalOf } = params
	if (!extRef.ln) return []
	const controlBlock = await resolveControlBlock({ extRef, context })
	const publisher = await resolveSignalLogicalNode({ element: extRef, context })
	if (!controlBlock || !publisher) return []

	const signal = signalOf.get(extRef.record.id)?.id
	const dataObject = readAttribute({ record: extRef.record, name: DATA_OBJECT_ATTRIBUTE })
	const companions: IedNode<'ExtRef'>[] = []
	for (const candidate of inLogicalNode) {
		if (candidate.record.id === extRef.record.id || candidate.ln?.id !== extRef.ln.id) continue
		const linked = signalOf.get(candidate.record.id)?.id
		if (linked !== undefined && linked !== signal) continue
		if (readAttribute({ record: candidate.record, name: DATA_OBJECT_ATTRIBUTE }) !== dataObject)
			continue
		const candidateBlock = await resolveControlBlock({ extRef: candidate, context })
		if (candidateBlock?.record.id !== controlBlock.record.id) continue
		const candidatePublisher = await resolveSignalLogicalNode({ element: candidate, context })
		if (candidatePublisher?.record.id !== publisher.record.id) continue
		companions.push(candidate)
	}
	return companions
}
