import { cloneAttributeValue } from './clone-attribute'

import { throwDialecteError } from '@dialecte/core'
import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { readAttribute } from '@/v2019C1/helpers'
import { isTopologyLevel } from '@/v2019C1/helpers/topology-levels'

import type { LineageUpdates, WriteIdentityParams } from './write-identity.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRef, AnyRefOrRecord, AnyTrackedRecord } from '@dialecte/core'

/**
 * Writes the instance lineage (`templateUuid` / `originUuid`) of a clone: the one place that decides it. A clone copies
 * the lineage of every element as the source holds it; each mapping carries the source record's attributes, so the
 * source document is read only where a mode needs a cloned root's parent.
 *
 * - `stamp-template` (instantiate / update): the clone is a new instance — `templateUuid <- source.uuid`, and, on an
 *   element whose declaration carries it, `originUuid <- source.originUuid`, else `source.templateUuid` (the origin
 *   of the template is conserved, the template's own template becomes the origin). The `uuid` is fresh.
 * - `keep` (fork, project base): the source's own elements — lineage as copied.
 * - `preserve` (copy): lineage as copied, where it still says something true. An element whose source parent (its
 *   nearest ancestor carrying a lineage) is part of an instance — it carries a `templateUuid` and is not a level of
 *   the topology, on which a layer's root sits — keeps its lineage only when its new parent carries the same
 *   `templateUuid`; otherwise its lineage goes, and so, by the same rule, does the lineage of what it holds.
 * - `strip` (extract): the elements named in `unlinked` lose their template link (`templateUuid`, `originUuid`);
 *   every other element keeps its lineage.
 */
export async function writeIdentity(
	tx: Core.Transaction<Config>,
	params: WriteIdentityParams,
): Promise<void> {
	switch (params.mode) {
		case 'keep':
			return
		case 'stamp-template':
			return stampLineage(tx, { cloneMappings: params.cloneMappings })
		case 'strip':
			return unlinkElements(tx, { cloneMappings: params.cloneMappings, unlinked: params.unlinked })
		case 'preserve':
			return preserveUnderSameTemplate(tx, {
				cloneMappings: params.cloneMappings,
				sourceQuery: params.sourceQuery,
				sourceRoots: params.sourceRoots,
			})
		default:
			throwDialecteError('ASSERTION_FAILED', {
				detail: `writeIdentity: unhandled identity mode ${String(params satisfies never)}`,
			})
	}
}

/** Each clone records its source as its template, and the source's origin (or template) as its origin. */
async function stampLineage(
	tx: Core.Transaction<Config>,
	params: { cloneMappings: readonly Scl.CloneMapping[] },
): Promise<void> {
	for (const mapping of params.cloneMappings) {
		const target = await tx.getRecord(mapping.target)
		if (!target) continue
		const { attributes } = mapping.source
		const lineage: LineageUpdates = {
			templateUuid: cloneAttributeValue({ attributes, name: 'uuid' }),
		}
		const carriesOrigin = getAttributeRules({
			dialecteConfig: SCL_DIALECTE_CONFIG,
			record: target,
			attributeName: 'originUuid',
		}).isDefined
		if (carriesOrigin) {
			lineage.originUuid =
				cloneAttributeValue({ attributes, name: 'originUuid' }) ??
				cloneAttributeValue({ attributes, name: 'templateUuid' })
		}
		await writeLineage(tx, { target, lineage })
	}
}

/** The elements whose template link is broken lose their lineage; the others keep it as copied. */
async function unlinkElements(
	tx: Core.Transaction<Config>,
	params: { cloneMappings: readonly Scl.CloneMapping[]; unlinked: ReadonlySet<string> },
): Promise<void> {
	const { cloneMappings, unlinked } = params
	for (const mapping of cloneMappings) {
		if (!unlinked.has(mapping.source.id ?? '')) continue
		const target = await tx.getRecord(mapping.target)
		if (target) await writeLineage(tx, { target, lineage: {} })
	}
}

/** A copy keeps its lineage where its new parent is an instance of the same template (see {@link writeIdentity}). */
async function preserveUnderSameTemplate(
	tx: Core.Transaction<Config>,
	params: {
		cloneMappings: readonly Scl.CloneMapping[]
		sourceQuery: Core.Query<Config>
		sourceRoots: readonly AnyRef[]
	},
): Promise<void> {
	const { cloneMappings, sourceQuery, sourceRoots } = params
	const mappingByTarget = new Map(
		cloneMappings.map((mapping) => [mapping.target.id ?? '', mapping]),
	)
	const conserved = new Map<Scl.CloneMapping, boolean>()

	async function isConserved(mapping: Scl.CloneMapping): Promise<boolean> {
		const known = conserved.get(mapping)
		if (known !== undefined) return known
		const target = await tx.getRecord(mapping.target)
		const targetParent = target ? await lineageParent(tx, { parent: target.parent }) : undefined
		const parentMapping = targetParent ? mappingByTarget.get(targetParent.id) : undefined
		let result: boolean
		if (parentMapping) {
			// the parent is cloned too: it carries its source's lineage when it keeps it
			result =
				!isPartOfInstance({
					tagName: parentMapping.source.tagName,
					templateUuid: cloneAttributeValue({
						attributes: parentMapping.source.attributes,
						name: 'templateUuid',
					}),
				}) || (await isConserved(parentMapping))
		} else {
			// a cloned root: its source, as the source holds it, and the parent it had there
			const sourceRef = sourceRoots.find((root) => root.id === mapping.source.id) ?? mapping.source
			const source = await sourceQuery.any.getRecord(sourceRef)
			const sourceParent = source
				? await lineageParent(sourceQuery, { parent: source.parent })
				: undefined
			const sourceTemplate = sourceParent ? heldLineage({ record: sourceParent }) : undefined
			result =
				!sourceParent ||
				!isPartOfInstance({ tagName: sourceParent.tagName, templateUuid: sourceTemplate }) ||
				(targetParent !== undefined && heldLineage({ record: targetParent }) === sourceTemplate)
		}
		conserved.set(mapping, result)
		return result
	}

	for (const mapping of cloneMappings) {
		if (await isConserved(mapping)) continue
		const target = await tx.getRecord(mapping.target)
		if (target) await writeLineage(tx, { target, lineage: {} })
	}
}

/**
 * Whether an element is part of an instance for the elements it holds: it carries a template lineage and is not a
 * level of the topology (a layer's root sits on a level, its lineage is its own).
 */
function isPartOfInstance(params: { tagName: string; templateUuid: string | undefined }): boolean {
	const { tagName, templateUuid } = params
	return templateUuid !== undefined && !isTopologyLevel(tagName)
}

/**
 * The parent an element's lineage is read against: its nearest ancestor whose declaration carries a template lineage
 * (a `SourceRef`'s is its `LNode`, past the `LNodeInputs` and the `Private` holding them).
 */
async function lineageParent(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: { parent: AnyRefOrRecord | null | undefined },
): Promise<AnyTrackedRecord | undefined> {
	const { parent } = params
	let current = parent ? await reader.any.getRecord(parent) : undefined
	while (current && !carriesLineage(current)) {
		current = current.parent ? await reader.any.getRecord(current.parent) : undefined
	}
	return current ?? undefined
}

/** Whether an element's declaration carries a template lineage (`templateUuid`). */
function carriesLineage(record: AnyTrackedRecord): boolean {
	return getAttributeRules({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		record,
		attributeName: 'templateUuid',
	}).isDefined
}

/** A lineage attribute a record holds (`templateUuid` by default), absent → `undefined`. */
function heldLineage(params: {
	record: AnyTrackedRecord
	name?: 'templateUuid' | 'originUuid'
}): string | undefined {
	const { record, name = 'templateUuid' } = params
	return readAttribute({ record, name, defaults: 'none', fullObject: true })?.value
}

/** Write the lineage keys that differ from what the target holds (an absent key removes the attribute). */
async function writeLineage(
	tx: Core.Transaction<Config>,
	params: { target: Scl.TrackedRecord<Scl.ElementsOf>; lineage: LineageUpdates },
): Promise<void> {
	const { target, lineage } = params
	const updates: LineageUpdates = {}
	let changed = false
	for (const name of ['templateUuid', 'originUuid'] as const) {
		const wanted = lineage[name]
		if (heldLineage({ record: target, name }) === wanted) continue
		updates[name] = wanted
		changed = true
	}
	if (changed) await tx.update(target, { attributes: updates })
}
