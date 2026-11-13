import { classifyIed, readIedKinds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { readSiblings } from '@/v2019C1/extensions/reference/query/build/signal-name'
import { findMappedLn } from '@/v2019C1/extensions/reference/query/resolve/find-mapped-ln'
import { resolveMappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'

import type { InfoContext, InfoContextParams } from './info-context.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type {
	MappedLNode,
	MappedLNodes,
} from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'
import type * as Core from '@dialecte/core'

/**
 * A context whose facts are read on first use and kept for the rest of the call. Given the LNodes
 * the call is about, what implements them and the kinds of the IEDs are read once for all;
 * otherwise one LNode and the one IED it maps to at a time.
 */
export function createInfoContext(
	query: Core.Query<Config>,
	params: InfoContextParams = {},
): InfoContext {
	const { lnodes } = params
	let iedKinds: Promise<ReadonlyMap<string, IedKind>> | undefined
	let mappedLNodes: Promise<MappedLNodes> | undefined
	const siblingsByParent = new Map<string, Promise<Core.AnyRawRecord[]>>()

	return {
		async iedKindOf(ied) {
			if (!lnodes) return classifyIed(query, { ied })
			iedKinds ??= readIedKindById(query)
			const kinds = await iedKinds
			return kinds.get(ied.id)
		},
		async mappedLNodeOf(lnode) {
			if (!lnodes) return readMappedLNode(query, { lnode })
			mappedLNodes ??= resolveMappedLNodes(query, { lnodes })
			const mapped = await mappedLNodes
			return mapped.get(lnode.id)
		},
		// Keyed by the stored parent: a parent the store does not hold answers each signal alone, as
		// `readSiblings` does, which names it by its own input whatever list it is reused for.
		signalSiblingsOf(signal) {
			const parentId = signal.parent?.id
			if (parentId === undefined) return readSiblings(query, signal)
			const known = siblingsByParent.get(parentId)
			if (known) return known
			const siblings = readSiblings(query, signal)
			siblingsByParent.set(parentId, siblings)
			return siblings
		},
	}
}

async function readIedKindById(query: Core.Query<Config>): Promise<ReadonlyMap<string, IedKind>> {
	const kinds = await readIedKinds(query)
	return new Map(kinds.map(({ ied, kind }) => [ied.id, kind]))
}

async function readMappedLNode(
	query: Core.Query<Config>,
	params: { lnode: Scl.TrackedRecord<'LNode'> },
): Promise<MappedLNode | undefined> {
	const found = await findMappedLn(query, params)
	return found && { ln: { tagName: found.ln.tagName, id: found.ln.id }, ied: found.ied }
}
