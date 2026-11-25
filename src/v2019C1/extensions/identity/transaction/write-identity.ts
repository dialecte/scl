import { cloneAttributeValue } from './clone-attribute'

import { throwDialecteError } from '@dialecte/core'
import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { readAttribute } from '@/v2019C1/helpers'

import type { LineageUpdates, WriteIdentityParams } from './write-identity.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Writes the instance lineage (`templateUuid` / `originUuid`) of a clone: the one place that decides it. A clone copies
 * the lineage of every element as the source holds it; each mapping carries the source record's attributes, so the
 * source document is never read.
 *
 * - `stamp-template` (instantiate / update): the clone is a new instance — `templateUuid <- source.uuid`, and, on an
 *   element whose declaration carries it, `originUuid <- source.originUuid`, else `source.templateUuid` (the origin
 *   of the template is conserved, the template's own template becomes the origin). The `uuid` is fresh.
 * - `keep` (fork, a copy, project base): the lineage as the clone copied it — the source's own elements, or a copy,
 *   which is another instance of the template its source is one of.
 * - `strip` (extract): the elements named in `unlinked` lose their template link (`templateUuid`, `originUuid`);
 *   every other element keeps its lineage.
 *
 * @intent stamp templateUuid/originUuid on cloned elements, set instance lineage after a clone, strip template lineage on extract
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
