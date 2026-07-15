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
	const [first] = await findInstancesUnder(reader, params)
	return first
}

/**
 * ALL records of `tagName` under `targetParent` whose `templateUuid` equals the
 * source uuid, in document order. The standard permits several instances of one
 * template (each with a unique instance uuid) under one anchor, so update/report
 * enumerate them and let the decision layer target a subset (multi-instance).
 * A matched instance root is not descended into (its subtree holds no sibling
 * instance of the same template lineage).
 */
export async function findInstancesUnder(
	reader: Reader,
	params: {
		targetParent: Scl.Ref<Scl.ElementsOf>
		tagName: Scl.ElementsOf
		sourceUuid: string | undefined
	},
): Promise<AnyTreeRecord[]> {
	const { targetParent, tagName, sourceUuid } = params
	if (!sourceUuid) return []
	const parentTree = await reader.any.getTree(targetParent)
	if (!parentTree) return []
	const out: AnyTreeRecord[] = []
	await collectByTemplateUuid(reader, { node: parentTree, tagName, sourceUuid, out })
	return out
}

async function collectByTemplateUuid(
	reader: Reader,
	params: {
		node: AnyTreeRecord
		tagName: Scl.ElementsOf
		sourceUuid: string
		out: AnyTreeRecord[]
	},
): Promise<void> {
	const { node, tagName, sourceUuid, out } = params
	if (
		node.tagName === tagName &&
		(await reader.any.getAttribute(node, { name: 'templateUuid' })) === sourceUuid
	) {
		out.push(node)
		return // a matched instance root; do not descend into its own subtree
	}
	for (const child of node.tree) {
		await collectByTemplateUuid(reader, { node: child, tagName, sourceUuid, out })
	}
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
	const [first] = await findInstancesByTemplateUuid(reader, params)
	return first
}

/**
 * ALL records of `tagName` anywhere whose `templateUuid` equals the source uuid,
 * in document order. The global counterpart of {@link findInstancesUnder} used
 * where there is no placement anchor (the ASD report/apply cascade), so several
 * instances of one template are enumerated and gated as a subset (multi-instance).
 */
export async function findInstancesByTemplateUuid(
	reader: Reader,
	params: { tagName: Scl.ElementsOf; sourceUuid: string | undefined },
): Promise<AnyTrackedRecord[]> {
	const { tagName, sourceUuid } = params
	if (!sourceUuid) return []
	const records = await reader.any.getRecordsByTagName(tagName)
	const out: AnyTrackedRecord[] = []
	for (const record of records) {
		if ((await reader.any.getAttribute(record, { name: 'templateUuid' })) === sourceUuid) {
			out.push(record)
		}
	}
	return out
}
