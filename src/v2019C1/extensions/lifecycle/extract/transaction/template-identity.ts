import {
	TEMPLATE_LINEAGE_ROOT_TAGS,
	TEMPLATE_NAMED_LEVEL_TAGS,
} from './template-identity.constants'

import { TEMPLATE_NAME } from '@/v2019C1/constants'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { TEMPLATE_ISD_IED_NAME } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-placement.constants'

import type { TemplateIdentityParams, TemplateNamingParams } from './template-identity.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The identity of a template ISD: every element a uuid of its own, the references inside the file repointed onto them.
 * The functions and applications of the process part, with what they hold, keep the lineage they carry (the templates
 * they were made from); every other element (the IED, its connections, the levels and equipment outside a function)
 * loses its own.
 */
export async function writeTemplateIdentity(
	tx: Core.Transaction<Config>,
	params: TemplateIdentityParams,
): Promise<void> {
	const { iedMappings, processMappings } = params
	const keeping = await readLineageKeepingTargets(tx, { processMappings })
	const unlinked = new Set<string>()
	for (const mapping of iedMappings) unlinked.add(mapping.source.id ?? '')
	for (const mapping of processMappings) {
		if (!keeping.has(mapping.target.id ?? '')) unlinked.add(mapping.source.id ?? '')
	}
	await finalizeClonedIdentity(tx, {
		cloneMappings: [...iedMappings, ...processMappings],
		mode: 'strip',
		unlinked,
	})
}

/**
 * Name a template ISD for no project: its IED `SPECIFICATION`, and each level of its process part (a substation, voltage
 * level, bay, line or process) `TEMPLATE` when no other level of its tag sits beside it (levels side by side keep their
 * names). The references naming them by their uuid follow at the commit.
 */
export async function nameTemplate(
	tx: Core.Transaction<Config>,
	params: TemplateNamingParams,
): Promise<void> {
	await tx.update(params.ied, { attributes: { name: TEMPLATE_ISD_IED_NAME } })
	const levels = await readClonedRecords(tx, {
		refs: params.processMappings
			.map((mapping) => mapping.target)
			.filter((ref) => TEMPLATE_NAMED_LEVEL_TAGS.has(ref.tagName)),
	})
	const besideCount = new Map<string, number>()
	for (const level of levels) {
		const key = siblingKey({ record: level })
		besideCount.set(key, (besideCount.get(key) ?? 0) + 1)
	}
	for (const level of levels) {
		if (besideCount.get(siblingKey({ record: level })) !== 1) continue
		await tx.update(level, { attributes: { name: TEMPLATE_NAME } })
	}
}

/** The process targets (record ids) keeping their lineage: a function or an application, and what it holds. */
async function readLineageKeepingTargets(
	tx: Core.Transaction<Config>,
	params: { processMappings: readonly Scl.CloneMapping[] },
): Promise<Set<string>> {
	const records = await readClonedRecords(tx, {
		refs: params.processMappings.map((mapping) => mapping.target),
	})
	const byId = new Map(records.map((record) => [record.id, record]))
	const keeps = new Map<string, boolean>()

	function keepsLineage(id: string): boolean {
		const known = keeps.get(id)
		if (known !== undefined) return known
		const record = byId.get(id)
		const parentId = record?.parent?.id
		const result =
			record !== undefined &&
			(TEMPLATE_LINEAGE_ROOT_TAGS.has(record.tagName) ||
				(parentId !== undefined && keepsLineage(parentId)))
		keeps.set(id, result)
		return result
	}

	return new Set(records.filter((record) => keepsLineage(record.id)).map((record) => record.id))
}

/** The cloned records, read in one batch. */
async function readClonedRecords(
	tx: Core.Transaction<Config>,
	params: { refs: readonly Scl.Ref<Scl.ElementsOf>[] },
): Promise<Scl.RawRecord<Scl.ElementsOf>[]> {
	const records = await tx.getRecords([...params.refs])
	return records.filter((record) => record !== undefined)
}

/** Levels sharing this key sit side by side: the same parent, the same tag. */
function siblingKey(params: { record: Scl.RawRecord<Scl.ElementsOf> }): string {
	return `${params.record.parent?.id ?? ''}|${params.record.tagName}`
}
