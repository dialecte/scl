import {
	DATA_REFERRER_LOGICAL_NODE_TAGS,
	MEMBER_KIND_BY_TAG,
} from './lost-data-instances.constants'

import { LNODE_TYPE_ATTRIBUTE } from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { VALUE_TAGS } from '@/v2019C1/extensions/data-model/query/read-value-types.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ValueTypes } from '@/v2019C1/extensions/data-model/query/read-value-types.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The data instances of the project (`DOI`, `SDI`, `DAI`) naming data the type the template gives their logical node
 * no longer holds, by record id, each with what it holds left out: they name nothing once the logical node follows the
 * template's type. The IED's data model is the template's: such an instance goes with the type change (listed removed,
 * written unless its group is skipped). A logical node the template does not hold, or one whose type it does not know,
 * is not judged. Walks the instance tree held, no read.
 */
export function readLostDataInstances(params: {
	sourceTree: AnyTreeRecord
	instanceTree: AnyTreeRecord
	matchKey: MatchKey
	types: ValueTypes
}): ReadonlySet<string> {
	const { sourceTree, instanceTree, matchKey, types } = params
	const templateTypes = new Map(
		flatten(sourceTree).flatMap((node): [string, string][] => {
			if (!DATA_REFERRER_LOGICAL_NODE_TAGS.has(node.tagName)) return []
			const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
			const lnType = readAttribute({ record: node, name: LNODE_TYPE_ATTRIBUTE, defaults: 'none' })
			return uuid && lnType ? [[uuid, lnType]] : []
		}),
	)
	return new Set(
		flatten(instanceTree).flatMap((node) => {
			if (!DATA_REFERRER_LOGICAL_NODE_TAGS.has(node.tagName)) return []
			const lineage = readAttribute({ record: node, name: matchKey, defaults: 'none' })
			const typeId = lineage ? templateTypes.get(lineage) : undefined
			if (!typeId || !types.membersById.has(typeId)) return []
			return node.tree.flatMap((child) => lostUnder({ node: child, typeId, types }))
		}),
	)
}

/** The data instances below a type that name no member of it: the instance itself, or those below the member it names. */
function lostUnder(params: { node: AnyTreeRecord; typeId: string; types: ValueTypes }): string[] {
	const { node, typeId, types } = params
	const kind = MEMBER_KIND_BY_TAG.get(node.tagName)
	if (kind === undefined) return []
	const name = readAttribute({ record: node, name: 'name', defaults: 'none' })
	const member = types.membersById.get(typeId)?.get(name)
	if (!member || (kind !== 'either' && member.continuesObject !== (kind === 'object')))
		return [node.id]
	if (node.tagName === VALUE_TAGS.attribute || !member.type) return []
	const memberType = member.type
	return node.tree.flatMap((child) => lostUnder({ node: child, typeId: memberType, types }))
}

/** A tree's nodes, the root first. */
function flatten(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flatten)]
}
