import { SIGNAL_DATA_ATTRIBUTE } from '../constants/signal-pairs.constants'

import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'

import type { SignalPairs } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'
import type { ImplementationResolution } from './resolve-implementation.types'
import type { SectionNode } from './section-node.types'

/**
 * The ExtRef / ExtCtrl a signal names: the one its uuid names, else the one its address names. The
 * address is read as the signal's LNode writes it (full, inside its IED, or the internal address
 * alone), each form tried in turn. When the address fits several elements (ExtRefs share an
 * internal address and differ by their data attribute) the one carrying the signal's data
 * attribute is taken; with none to tell them apart the address is `ambiguous`. No element while
 * the signal names none, or the one it names is not in the document.
 */
export async function resolveImplementation(params: {
	pairs: SignalPairs['implementation']
	attributes: Readonly<Record<string, string>>
	holder: SectionNode<'LNode'>
	context: DataflowContext
}): Promise<ImplementationResolution> {
	const { pairs, attributes, holder, context } = params
	const section = await context.iedSection()
	const maps = {
		ExtRef: { byUuid: section.extRefsByUuid, byPath: section.extRefsByPath },
		ExtCtrl: { byUuid: section.extCtrlsByUuid, byPath: section.extCtrlsByPath },
	}
	const { byUuid, byPath } = maps[pairs.targets[0] as keyof typeof maps]

	const uuid = attributes[pairs.uuid]
	if (uuid) return { element: byUuid.get(uuid), ambiguous: false }

	const path = attributes[pairs.path]
	if (!path) return { element: undefined, ambiguous: false }
	const parsed = parseReferencePath({
		resolution: pairs.resolution,
		pathAttribute: pairs.path,
		pathValue: path,
		ancestry: [holder.record],
	})
	if (!parsed) return { element: undefined, ambiguous: false }

	for (const key of [parsed.lookupKey, ...(parsed.fallbackLookupKeys ?? [])]) {
		const candidates: readonly IedNode<'ExtRef' | 'ExtCtrl'>[] = byPath.get(key) ?? []
		if (candidates.length === 0) continue
		const element = await chooseCandidate({
			candidates,
			dataAttribute: attributes[SIGNAL_DATA_ATTRIBUTE],
			context,
		})
		return { element, ambiguous: element === undefined }
	}
	return { element: undefined, ambiguous: false }
}

/** The only candidate, else the one carrying the signal's data attribute (when it is the only one). */
async function chooseCandidate(params: {
	candidates: readonly IedNode<'ExtRef' | 'ExtCtrl'>[]
	dataAttribute: string | undefined
	context: DataflowContext
}): Promise<IedNode<'ExtRef' | 'ExtCtrl'> | undefined> {
	const { candidates, dataAttribute, context } = params
	if (candidates.length === 1) return candidates[0]
	if (!dataAttribute) return undefined
	const matching: IedNode<'ExtRef' | 'ExtCtrl'>[] = []
	for (const candidate of candidates) {
		const candidateData = await context.query.any.getAttribute(candidate.record, {
			name: SIGNAL_DATA_ATTRIBUTE,
		})
		if (candidateData === dataAttribute) matching.push(candidate)
	}
	return matching.length === 1 ? matching[0] : undefined
}
