import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { identityEquals, resolveIdentity } from '@/v2019C1/extensions/identity/query'

import type { Scl, Config } from '@/v2019C1/config'
import type { ElementIdentity } from '@/v2019C1/extensions/identity/query'
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
	params: {
		tagName: Scl.ElementsOf
		sourceUuid: string | undefined
		matchKey?: MatchKey
		sourceIdentity?: ElementIdentity
	},
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
 * Matching is schema-driven (`resolveIdentity`), no name fallback:
 *  - **uuid-bearing** `tagName` → LINEAGE ONLY (`instance[matchKey] === sourceUuid`). A miss is a
 *    miss; a same-name element sharing no lineage is never adopted (that was the scaffold-`TEMPLATE`
 *    bug). A project whose lineage is a hand-authored placeholder is a data defect surfaced by the UI
 *    `checkTemplateUuids` warning, not recovered here.
 *  - **uuid-less** `tagName` with schema `identityFields` → matched by the `sourceIdentity` fields
 *    tuple, unambiguous only (e.g. DataTypeTemplates types by `id`). Callers pass `sourceIdentity`
 *    (from `resolveIdentity(sourceRecord)`) for these; uuid-bearing callers pass nothing.
 */
export async function findInstancesByTemplateUuid(
	reader: Reader,
	params: {
		tagName: Scl.ElementsOf
		sourceUuid: string | undefined
		/** Attribute matched against `sourceUuid`. Default `templateUuid`; `uuid` for fork. */
		matchKey?: MatchKey
		/** The source element's identity, required only for a uuid-less (fields-identified) tag. */
		sourceIdentity?: ElementIdentity
	},
): Promise<AnyTrackedRecord[]> {
	const { tagName, sourceUuid, matchKey = 'templateUuid', sourceIdentity } = params
	const records = await reader.any.getRecordsByTagName(tagName)

	const byLineage: AnyTrackedRecord[] = []
	if (sourceUuid) {
		for (const record of records) {
			if ((await reader.any.getAttribute(record, { name: matchKey })) === sourceUuid) {
				byLineage.push(record)
			}
		}
	}
	if (byLineage.length > 0) return byLineage

	// uuid-bearing: lineage is the ONLY identity — no name fallback.
	// asked of the tag, not of one record: the tag-level definition, the union of its declarations
	const carriesUuid = 'uuid' in SCL_DIALECTE_CONFIG.definition[tagName].attributes.details
	if (carriesUuid) return []

	// uuid-less: identify by the schema's identityFields (unambiguous match required).
	if (sourceIdentity?.kind !== 'fields') return []
	const byFields: AnyTrackedRecord[] = []
	for (const record of records) {
		if (identityEquals(await resolveIdentity(reader, record), sourceIdentity)) byFields.push(record)
	}
	return byFields.length === 1 ? byFields : []
}

/**
 * Narrow a set of matched instances to those SCOPED to one specific target instance: the instance
 * itself, or any instance structurally UNDER it. When `targetInstance` is undefined, every instance
 * passes (the default — operate on ALL instances of the template, a template-rollout).
 *
 * This is the multi-instance anchor seam: a consumer names ONE target instance (e.g. a specific
 * pasted Bay) and every enumeration point in the update/report verbs filters through here, so the
 * frame, the applications and the composed functions all resolve under the chosen instance and no
 * other. The containment predicate makes it uniform across layers — a Bay `targetInstance` scopes
 * its descendant Applications/Functions; a Function/Application `targetInstance` scopes itself.
 */
export async function scopeToTargetInstance<GenericRecord extends { id: string; tagName: string }>(
	reader: Reader,
	params: {
		instances: readonly GenericRecord[]
		targetInstance: Scl.Ref<Scl.ElementsOf> | undefined
	},
): Promise<GenericRecord[]> {
	const { instances, targetInstance } = params
	if (!targetInstance) return [...instances]

	const scoped: GenericRecord[] = []
	for (const instance of instances) {
		if (instance.id === targetInstance.id) {
			scoped.push(instance)
			continue
		}
		const ancestors = await reader.findAncestors({
			tagName: instance.tagName,
			id: instance.id,
		} as Scl.Ref<Scl.ElementsOf>)
		if (ancestors.some((ancestor) => ancestor.id === targetInstance.id)) scoped.push(instance)
	}
	return scoped
}
