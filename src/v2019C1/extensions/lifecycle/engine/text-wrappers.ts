import { toRef } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { AcceptedIds } from './decide.types'
import type { DiffNode } from './diff.types'
import type { TextWrapperPair } from './text-wrappers.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

const TRANSPARENT: readonly string[] = SCL_DIALECTE_CONFIG.transparentElements

/**
 * The diff nodes of the wrappers of a matched element holding text only — vendor data in a `Private`, which the
 * compared trees see through and so never show —, each paired with the instance's wrapper of its `type`: `modified`
 * with its `textChange` when the template changed the text, `unchanged` otherwise, `added` when the instance holds
 * none of that type. A wrapper only the instance holds is the project's data: not listed.
 */
export async function diffTextWrappers(
	sourceQuery: Core.Query<Config> | Core.Transaction<Config>,
	params: {
		targetQuery: Core.Query<Config> | Core.Transaction<Config>
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
	},
): Promise<DiffNode[]> {
	const pairs = await pairTextWrappers(sourceQuery, params)
	return pairs.map((pair) => textWrapperNode(pair))
}

/** The diff node of one wrapper of the template, against the instance's of its type. */
function textWrapperNode(pair: TextWrapperPair): DiffNode {
	const { source, instance } = pair
	if (!instance)
		return { change: 'added', tagName: source.tagName, sourceRef: toRef(source), children: [] }
	const before = instance.value.trim()
	const after = source.value.trim()
	const matched = {
		tagName: source.tagName,
		sourceRef: toRef(source),
		instanceRef: toRef(instance),
	}
	if (before === after) return { change: 'unchanged', ...matched, children: [] }
	return { change: 'modified', ...matched, textChange: { before, after }, children: [] }
}

/**
 * Write what {@link diffTextWrappers} lists for a matched element, each wrapper gated by its own decision: the
 * template's text on the instance's wrapper of its type, or a copy of the template's wrapper when the instance holds
 * none.
 */
export async function reconcileTextWrappers(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		instanceRecord: AnyTreeRecord
		accepted: AcceptedIds | undefined
	},
): Promise<void> {
	const { sourceQuery, sourceNode, instanceRecord, accepted } = params
	const pairs = await pairTextWrappers(sourceQuery, {
		targetQuery: tx,
		sourceNode,
		instanceNode: instanceRecord,
	})
	for (const { source, instance } of pairs) {
		if (accepted && !accepted.sourceIds.has(source.id)) continue
		if (!instance) {
			await tx.any.addChild(instanceRecord, {
				tagName: source.tagName,
				attributes: source.attributes,
				value: source.value,
			})
		} else if (instance.value.trim() !== source.value.trim()) {
			await tx.any.update(instance, { value: source.value })
		}
	}
}

/** Each text-only wrapper of the source element, with the instance's of the same `type` not paired yet. */
async function pairTextWrappers(
	sourceQuery: Core.Query<Config> | Core.Transaction<Config>,
	params: {
		targetQuery: Core.Query<Config> | Core.Transaction<Config>
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
	},
): Promise<TextWrapperPair[]> {
	const { targetQuery, sourceNode, instanceNode } = params
	const sourceWrappers = await readTextWrappers(sourceQuery, { element: sourceNode })
	if (sourceWrappers.length === 0) return []
	const instanceWrappers = await readTextWrappers(targetQuery, { element: instanceNode })

	const pairs: TextWrapperPair[] = []
	const paired = new Set<string>()
	for (const source of sourceWrappers) {
		const type = await sourceQuery.any.getAttribute(source, { name: 'type' })
		let instance: AnyTrackedRecord | undefined
		for (const candidate of instanceWrappers) {
			if (paired.has(candidate.id)) continue
			if ((await targetQuery.any.getAttribute(candidate, { name: 'type' })) !== type) continue
			instance = candidate
			break
		}
		if (instance) paired.add(instance.id)
		pairs.push({ source, instance })
	}
	return pairs
}

/** The wrappers directly under an element that hold text and no element. */
async function readTextWrappers(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: { element: AnyTreeRecord },
): Promise<AnyTrackedRecord[]> {
	const record = await reader.any.getRecord(params.element)
	const wrappers: AnyTrackedRecord[] = []
	for (const childRef of record?.children ?? []) {
		if (!TRANSPARENT.includes(childRef.tagName)) continue
		const child = await reader.any.getRecord(childRef)
		if (child && child.children.length === 0 && child.value.trim() !== '') wrappers.push(child)
	}
	return wrappers
}
