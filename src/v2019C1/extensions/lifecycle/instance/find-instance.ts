import type { Scl, Config } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
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
		/** Attribute matched against `sourceUuid`. Default `templateUuid`; `uuid` for fork. */
		matchKey?: MatchKey
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
		/** Attribute matched against `sourceUuid`. Default `templateUuid`; `uuid` for fork. */
		matchKey?: MatchKey
	},
): Promise<AnyTreeRecord[]> {
	const { targetParent, tagName, sourceUuid, matchKey = 'templateUuid' } = params
	if (!sourceUuid) return []
	const parentTree = await reader.any.getTree(targetParent)
	if (!parentTree) return []
	const out: AnyTreeRecord[] = []
	await collectByMatchKey(reader, { node: parentTree, tagName, sourceUuid, matchKey, out })
	return out
}

async function collectByMatchKey(
	reader: Reader,
	params: {
		node: AnyTreeRecord
		tagName: Scl.ElementsOf
		sourceUuid: string
		matchKey: MatchKey
		out: AnyTreeRecord[]
	},
): Promise<void> {
	const { node, tagName, sourceUuid, matchKey, out } = params
	if (
		node.tagName === tagName &&
		(await reader.any.getAttribute(node, { name: matchKey })) === sourceUuid
	) {
		out.push(node)
		return // a matched instance root; do not descend into its own subtree
	}
	for (const child of node.tree) {
		await collectByMatchKey(reader, { node: child, tagName, sourceUuid, matchKey, out })
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
	params: { tagName: Scl.ElementsOf; sourceUuid: string | undefined; sourceName?: string },
): Promise<AnyTrackedRecord | undefined> {
	const [first] = await findInstancesByTemplateUuid(reader, params)
	return first
}

/**
 * ALL records of `tagName` anywhere whose `templateUuid` equals the source uuid,
 * in document order. The global counterpart of {@link findInstancesUnder} used
 * where there is no placement anchor (the ASD report/apply cascade), so several
 * instances of one template are enumerated and gated as a subset (multi-instance).
 *
 * `sourceName` opt-in fallback: when NO instance carries the source `uuid` as its
 * `templateUuid` — an externally-authored project whose `templateUuid` lineage is
 * broken (a placeholder value, not the source uuid, as real .ssd files reuse one
 * dummy across elements) — recognize the instance by `name` instead, but ONLY when
 * it is unambiguous (exactly one same-tag element of that name), so an unrelated
 * element is never adopted. Callers that omit `sourceName` keep the strict lineage
 * behaviour.
 */
export async function findInstancesByTemplateUuid(
	reader: Reader,
	params: { tagName: Scl.ElementsOf; sourceUuid: string | undefined; sourceName?: string },
): Promise<AnyTrackedRecord[]> {
	const { tagName, sourceUuid, sourceName } = params
	const records = await reader.any.getRecordsByTagName(tagName)

	const byLineage: AnyTrackedRecord[] = []
	if (sourceUuid) {
		for (const record of records) {
			if ((await reader.any.getAttribute(record, { name: 'templateUuid' })) === sourceUuid) {
				byLineage.push(record)
			}
		}
	}
	if (byLineage.length > 0) return byLineage
	if (!sourceName) return []

	const byName: AnyTrackedRecord[] = []
	for (const record of records) {
		if ((await reader.any.getAttribute(record, { name: 'name' })) === sourceName) {
			byName.push(record)
		}
	}
	return byName.length === 1 ? byName : []
}
