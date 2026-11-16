import { instanceTagOf } from './instance-tag'
import { KEY_PAIRING_ROOT_TAGS } from './pair-by-key.constants'

import { keyFieldsOf } from '@/v2019C1/extensions/identity/query/key-fields'
import { isSingletonChild } from '@/v2019C1/extensions/identity/query/singleton-child'
import { readAttribute } from '@/v2019C1/helpers'

import type { KeyPairings, PairByKeyParams } from './pair-by-key.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * In an IED, the elements whose lineage misses — the template holds no element of the uuid their lineage names, as
 * when an IED file without uuids is imported again and its elements get other uuids — paired by their key (`name`,
 * `inst`, `prefix` + `lnClass` + `inst`, ...; for a tag without key, only one the schema holds once: an `LN0`) with an
 * instance element of
 * the same parent whose lineage names nothing the template holds, or none. Read top-down from the walk's root pair,
 * before the walk, so a reference naming a paired element (a data set entry naming a logical node walked after it)
 * pairs through `redirectedSourceUuids`. Never the root, never outside an IED: elsewhere a uuid is the element's
 * identity for its life. Reads the trees as held, no query.
 */
export function pairByKeyOnLineageMiss(params: PairByKeyParams): KeyPairings {
	const pinnedMatches = new Map<string, string>()
	const redirectedSourceUuids = new Map<string, string>()
	const keys = new Map<string, string>()
	const pairings = { pinnedMatches, redirectedSourceUuids, keys }
	if (!KEY_PAIRING_ROOT_TAGS.has(params.sourceTree.tagName)) return pairings

	const pending: [AnyTreeRecord, AnyTreeRecord][] = [[params.sourceTree, params.instanceTree]]
	while (pending.length > 0) {
		const pair = pending.pop()
		if (!pair) break
		const [sourceNode, instanceNode] = pair
		const taken = new Set<string>()
		for (const sourceChild of sourceNode.tree) {
			const counterpart = counterpartOf({ ...params, sourceNode, sourceChild, instanceNode, taken })
			if (!counterpart) continue
			taken.add(counterpart.record.id)
			if (counterpart.key !== undefined) {
				pinnedMatches.set(sourceChild.id, counterpart.record.id)
				keys.set(sourceChild.id, counterpart.key)
				const sourceUuid = readAttribute({ record: sourceChild, name: 'uuid', defaults: 'none' })
				const instanceUuid = readAttribute({
					record: counterpart.record,
					name: 'uuid',
					defaults: 'none',
				})
				if (sourceUuid && instanceUuid) redirectedSourceUuids.set(instanceUuid, sourceUuid)
			}
			pending.push([sourceChild, counterpart.record])
		}
	}
	return pairings
}

/**
 * The instance element a source child lands on for the key pass: by lineage when it hits (no key), else by key among
 * the instance children its lineage leaves free; a uuid-less child by its key, else the next of its tag (the matcher's
 * rule), only to walk on below it.
 */
function counterpartOf(
	params: PairByKeyParams & {
		sourceNode: AnyTreeRecord
		sourceChild: AnyTreeRecord
		instanceNode: AnyTreeRecord
		taken: ReadonlySet<string>
	},
): { record: AnyTreeRecord; key?: string } | undefined {
	const { sourceChild, instanceNode, taken, index, sourceUuids, matchKey } = params
	const tagName = instanceTagOf(sourceChild.tagName)
	const sameTag = instanceNode.tree.filter(
		(child) => child.tagName === tagName && !taken.has(child.id),
	)
	const sourceUuid = readAttribute({ record: sourceChild, name: 'uuid', defaults: 'none' })
	if (!sourceUuid) {
		const fields = keyFieldsOf(tagName)
		const record =
			fields.length === 0
				? sameTag[0]
				: sameTag.find(
						(child) => keyOf({ record: child, fields }) === keyOf({ record: sourceChild, fields }),
					)
		return record && { record }
	}
	const hit = index.get(sourceUuid)
	if (hit) return hit.tagName === tagName ? { record: hit } : undefined
	// the lineage misses: an instance child whose lineage names nothing the template holds may be it, by its key
	const free = sameTag.filter((child) => {
		const lineage = readAttribute({ record: child, name: matchKey, defaults: 'none' })
		return !lineage || !sourceUuids.has(lineage)
	})
	const fields = keyFieldsOf(tagName)
	if (fields.length === 0) {
		// a tag without key pairs only where the schema holds one of it (an LN0 in its device), the one there is
		if (!isSingletonChild({ parentTag: params.sourceNode.tagName, childTag: tagName }))
			return undefined
		return free.length === 1 ? { record: free[0], key: `only ${tagName}` } : undefined
	}
	const key = keyOf({ record: sourceChild, fields })
	const record = free.find((child) => keyOf({ record: child, fields }) === key)
	return record && { record, key }
}

/** A record's key as one string: each key field `name=value`, an absent one empty. */
function keyOf(params: { record: AnyTreeRecord; fields: readonly string[] }): string {
	return params.fields
		.map(
			(field) =>
				`${field}=${readAttribute({ record: params.record, name: field, defaults: 'none' })}`,
		)
		.join('|')
}
