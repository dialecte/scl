import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { NamedTarget } from './named-targets.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Every uuid a referrer names, from both reference registries (uuid pairs and tuple pairs), with the tags it may point
 * at; an LNode's binding included. Reads a record as held, or the source of a clone mapping (its tag and attributes).
 *
 * @internal scl-internal, read by the lifecycle's target lineages and the names-follow constraint
 */
export function uuidsNamedBy(params: {
	tagName: string
	attributes: readonly { name: string; value: string }[]
}): NamedTarget[] {
	const references = REFERENCE_UUIDS_BY_TAG.get(params.tagName) ?? []
	return references.flatMap((reference): NamedTarget[] => {
		const uuid = params.attributes.find((attribute) => attribute.name === reference.uuid)?.value
		if (!uuid) return []
		return [
			{ uuid, target: reference.target, form: reference.form, followsOnly: reference.followsOnly },
		]
	})
}

/**
 * The targets a reference names by uuid (`uuidsNamedBy`), an LNode's binding left out: the binding rules own it.
 *
 * @internal scl-internal, read by the lifecycle's scopes and repoint
 */
export function namedTargetsOf(params: {
	tagName: string
	attributes: readonly { name: string; value: string }[]
}): NamedTarget[] {
	return uuidsNamedBy(params).filter((named) => !named.followsOnly)
}

/**
 * The records the given targets name, by uuid: one read of each target tag, whatever the number of targets.
 *
 * @internal scl-internal, read by the lifecycle's instance scope and lineages, and the names-follow constraint
 */
export async function findNamedRecords(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: { named: readonly NamedTarget[] },
): Promise<ReadonlyMap<string, readonly AnyTrackedRecord[]>> {
	const uuids = new Set(params.named.map((named) => named.uuid))
	const tags = [...new Set(params.named.flatMap((named) => named.target))]
	if (uuids.size === 0) return new Map()
	// dialecte-allow query-in-loop: one read per target tag (a few at most): core reads one tag per call
	const found = await Promise.all(tags.map((tagName) => reader.any.getRecordsByTagName(tagName)))
	const byUuid = new Map<string, AnyTrackedRecord[]>()
	for (const record of found.flat()) {
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (uuid && uuids.has(uuid)) byUuid.set(uuid, [...(byUuid.get(uuid) ?? []), record])
	}
	return byUuid
}
