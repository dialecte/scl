import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { identityEquals, resolveIdentity } from '@/v2019C1/extensions/identity/query'
import { readAttribute } from '@/v2019C1/helpers'

import type { InstanceReader, TargetInstances } from './instance.types'
import type { Scl } from '@/v2019C1/config'
import type { ElementIdentity } from '@/v2019C1/extensions/identity/query'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The first record of `tagName` under `targetParent` whose `templateUuid`
 * equals the source uuid, if any. The scoped counterpart of
 * {@link findInstancesByTemplateUuid}, used where a placement anchor exists.
 */
export async function findInstanceUnder(
	reader: InstanceReader,
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
	reader: InstanceReader,
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
	return collectByMatchKey({ node: parentTree, tagName, sourceUuid, matchKey })
}

/** The nodes of a tree of `tagName` carrying `sourceUuid` under `matchKey`, in document order: a match is not descended into. */
function collectByMatchKey(params: {
	node: AnyTreeRecord
	tagName: Scl.ElementsOf
	sourceUuid: string
	matchKey: MatchKey
}): AnyTreeRecord[] {
	const { node, tagName, sourceUuid, matchKey } = params
	if (
		node.tagName === tagName &&
		readAttribute({ record: node, name: matchKey, defaults: 'none' }) === sourceUuid
	) {
		return [node] // a matched instance root; do not descend into its own subtree
	}
	return node.tree.flatMap((child) => collectByMatchKey({ ...params, node: child }))
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
	reader: InstanceReader,
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

	const byLineage = sourceUuid
		? records.filter(
				(record) => readAttribute({ record, name: matchKey, defaults: 'none' }) === sourceUuid,
			)
		: []
	if (byLineage.length > 0) return byLineage

	// uuid-bearing: lineage is the ONLY identity — no name fallback.
	// asked of the tag, not of one record: the tag-level definition, the union of its declarations
	const carriesUuid = 'uuid' in SCL_DIALECTE_CONFIG.definition[tagName].attributes.details
	if (carriesUuid) return []

	// uuid-less: identify by the schema's identityFields (unambiguous match required).
	if (sourceIdentity?.kind !== 'fields') return []
	const byFields: AnyTrackedRecord[] = []
	for (const record of records) {
		const identity = await resolveIdentity(reader, record)
		if (identityEquals(identity, sourceIdentity)) byFields.push(record)
	}
	return byFields.length === 1 ? byFields : []
}

/**
 * The elements of the project carrying a uuid as their own, among the given tags, wherever they sit. A uuid names one
 * element of a file: under a scenario that keeps the source's uuids, such an element IS the source element's
 * instance, to reconcile where it sits — never one to place a second copy beside.
 */
export async function findByOwnUuid(
	reader: InstanceReader,
	params: { tagNames: readonly Scl.ElementsOf[]; uuid: string | undefined },
): Promise<AnyTrackedRecord[]> {
	const { tagNames, uuid } = params
	const found: AnyTrackedRecord[] = []
	for (const tagName of tagNames) {
		const records = await findInstancesByTemplateUuid(reader, {
			tagName,
			sourceUuid: uuid,
			matchKey: 'uuid',
		})
		found.push(...records)
	}
	return found
}

/**
 * Narrow a set of matched instances to those SCOPED to the target instances: an instance named, or any instance
 * structurally UNDER one named. When `targetInstance` is undefined, every instance passes (the default — operate on ALL
 * instances of the template, a template-rollout); an empty list lets none pass.
 *
 * This is the multi-instance anchor seam: a consumer names ONE target instance (e.g. a specific
 * pasted Bay), or a caller the instances one operation owns (the functions an IED's specification holds, beside those
 * of another IED placed from the same template on the same bay), and every enumeration point in the update/report verbs
 * filters through here, so the frame, the applications and the composed functions all resolve under the chosen
 * instances and no other. The containment predicate makes it uniform across layers — a Bay `targetInstance` scopes
 * its descendant Applications/Functions; a Function/Application `targetInstance` scopes itself.
 */
export async function scopeToTargetInstance<GenericRecord extends { id: string; tagName: string }>(
	reader: InstanceReader,
	params: {
		instances: readonly GenericRecord[]
		targetInstance: TargetInstances | undefined
	},
): Promise<GenericRecord[]> {
	const { instances, targetInstance } = params
	if (!targetInstance) return [...instances]
	const targetIds = new Set(toRefList(targetInstance).map((target) => target.id))

	const scoped: GenericRecord[] = []
	for (const instance of instances) {
		if (targetIds.has(instance.id)) {
			scoped.push(instance)
			continue
		}
		if (targetIds.size === 0) continue
		const ancestors = await reader.findAncestors({
			tagName: instance.tagName,
			id: instance.id,
		} as Scl.Ref<Scl.ElementsOf>)
		if (ancestors.some((ancestor) => targetIds.has(ancestor.id))) scoped.push(instance)
	}
	return scoped
}

/** The target instances as a list: one ref is a list of one. */
function toRefList(targetInstance: TargetInstances): readonly Scl.Ref<Scl.ElementsOf>[] {
	return isRefList(targetInstance) ? targetInstance : [targetInstance]
}

function isRefList(
	targetInstance: TargetInstances,
): targetInstance is readonly Scl.Ref<Scl.ElementsOf>[] {
	return Array.isArray(targetInstance)
}
