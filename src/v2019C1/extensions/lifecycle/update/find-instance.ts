import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/** A reader with the untyped `.any` facade — either a Query or a Transaction. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The first record of `tagName` under `targetParent` whose `templateUuid`
 * equals the source uuid, if any. The scoped counterpart of
 * {@link findInstanceByTemplateUuid}, used where a placement anchor exists.
 */
export async function findInstanceUnder(
	reader: Reader,
	params: {
		targetParent: Scl.Ref<Scl.ElementsOf>
		tagName: Scl.ElementsOf
		sourceUuid: string | undefined
	},
): Promise<AnyTreeRecord | undefined> {
	const { targetParent, tagName, sourceUuid } = params
	if (!sourceUuid) return undefined
	const parentTree = await reader.any.getTree(targetParent)
	if (!parentTree) return undefined
	return walkForTemplateUuid(reader, { node: parentTree, tagName, sourceUuid })
}

async function walkForTemplateUuid(
	reader: Reader,
	params: { node: AnyTreeRecord; tagName: Scl.ElementsOf; sourceUuid: string },
): Promise<AnyTreeRecord | undefined> {
	const { node, tagName, sourceUuid } = params
	if (
		node.tagName === tagName &&
		(await reader.any.getAttribute(node, { name: 'templateUuid' })) === sourceUuid
	) {
		return node
	}
	for (const child of node.tree) {
		const found = await walkForTemplateUuid(reader, { node: child, tagName, sourceUuid })
		if (found) return found
	}
	return undefined
}

/**
 * The first record of `tagName` anywhere whose `templateUuid` equals the source
 * uuid, if any. The generic global lookup used where there is no placement
 * anchor (e.g. the report cascade). Multi-instance disambiguation (several
 * instances of one template) is a deferred concern.
 */
export async function findInstanceByTemplateUuid(
	reader: Reader,
	params: { tagName: Scl.ElementsOf; sourceUuid: string | undefined },
): Promise<AnyTrackedRecord | undefined> {
	const { tagName, sourceUuid } = params
	if (!sourceUuid) return undefined
	const records = await reader.any.getRecordsByTagName(tagName)
	for (const record of records) {
		if ((await reader.any.getAttribute(record, { name: 'templateUuid' })) === sourceUuid) {
			return record
		}
	}
	return undefined
}
