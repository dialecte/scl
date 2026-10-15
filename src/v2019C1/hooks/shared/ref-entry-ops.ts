import { isElementOf, toRawRecord } from '@dialecte/core/helpers'

import { Scl, SCL_DIALECTE_CONFIG, Config } from '@/v2019C1/config'
import { REF_ENTRIES_BY_TARGET } from '@/v2019C1/extensions/reference'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'
import { buildReferenceAttributes } from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'

import type { ElementPath } from '@/v2019C1/extensions/reference/query/build'
import type * as Core from '@dialecte/core'

/**
 * Rebuild what each reference to `target` holds for it: its path, and the attributes it writes
 * from the target's path (a terminal's level names). The references are found by `uuid`, the
 * target's; its path is read once, and only when a reference exists (pass `targetPath` when it was
 * already read).
 */
export async function rebuildReferencesByUuid(
	query: Core.Query<Config>,
	params: { uuid: string; target: Scl.Ref<Scl.ElementsOf>; targetPath?: ElementPath },
): Promise<Scl.Operation[]> {
	const { uuid, target } = params

	const referrers = await findReferrersByUuid(query, { uuid, targetTagName: target.tagName })
	if (referrers.length === 0) return []

	const targetPath = params.targetPath ?? (await buildElementPath(query, target))
	if (!targetPath) return []

	const operations: Scl.Operation[] = []
	for (const referrer of referrers) {
		const record = toRawRecord(referrer)
		const reference = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
		const values = await buildReferenceAttributes(query, { reference, target, targetPath })
		const attributes = withAttributeValues(record.attributes, values)
		if (attributes !== record.attributes) operations.push(updatedOperation(record, attributes))
	}
	return operations
}

/** The records whose uuid attribute, for a pair that can target `targetTagName`, is `uuid`. */
async function findReferrersByUuid(
	query: Core.Query<Config>,
	params: { uuid: string; targetTagName: string },
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { uuid, targetTagName } = params
	const referrers = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()

	for (const entry of REF_ENTRIES_BY_TARGET.get(targetTagName) ?? []) {
		if (!isElementOf(entry.refTagName, SCL_DIALECTE_CONFIG)) continue
		const found = await query.findByAttributes({
			tagName: entry.refTagName,
			attributes: { [entry.uuidAttr]: uuid },
		})
		for (const record of found as Scl.TrackedRecord<Scl.ElementsOf>[]) {
			referrers.set(record.id, record)
		}
	}
	return [...referrers.values()]
}

/** The element `uuid` names among `targetTagNames`, the first tag first. */
export async function findTargetByUuid(
	query: Core.Query<Config>,
	params: { uuid: string; targetTagNames: readonly string[] },
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const { uuid, targetTagNames } = params
	for (const targetTagName of targetTagNames) {
		if (!isElementOf(targetTagName, SCL_DIALECTE_CONFIG)) continue
		const [match] = await query.findByAttributes({ tagName: targetTagName, attributes: { uuid } })
		if (match) return { tagName: match.tagName, id: match.id } as Scl.Ref<Scl.ElementsOf>
	}
	return undefined
}
