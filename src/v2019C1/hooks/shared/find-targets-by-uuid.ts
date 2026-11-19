import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { readAttribute } from '@/v2019C1/helpers'

import type { TargetSought } from './find-targets-by-uuid.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The element each uuid names among its tags, in the order given, `undefined` when none: the first tag holding one
 * first, then the first match that tag answers, as `findRecordByUuid` finds one uuid. Round r looks up the r-th tag of
 * each uuid still not found, one value-list lookup per tag of the round: a single uuid costs one lookup per tag tried,
 * many uuids among the same tags cost no more lookups. Not `findNamedRecords` (behind `readLiveTargetUuids`): that one reads
 * every target tag whole and answers every match of a uuid across the tags; `namedTargetUuids` reads nothing.
 */
export async function findTargetsByUuid(
	query: Core.Query<Config>,
	params: { sought: readonly TargetSought[] },
): Promise<(Scl.TrackedRecord<Scl.ElementsOf> | undefined)[]> {
	const { sought } = params
	const found: (Scl.TrackedRecord<Scl.ElementsOf> | undefined)[] = sought.map(() => undefined)
	let pending = sought.flatMap((entry, index) => (entry.uuid ? [index] : []))
	for (let round = 0; pending.length > 0; round++) {
		const uuidsByTag = new Map<Scl.ElementsOf, Set<string>>()
		for (const index of pending) {
			const tagName = sought[index].targetTagNames[round]
			if (!isElementOf(tagName, SCL_DIALECTE_CONFIG)) continue
			uuidsByTag.set(tagName, (uuidsByTag.get(tagName) ?? new Set()).add(sought[index].uuid))
		}
		const lookups = await Promise.all(
			[...uuidsByTag].map(function lookUpTag([tagName, uuids]) {
				// dialecte-allow query-in-loop: one lookup per tag of a round, whatever the number of uuids
				return query.findByAttributes({ tagName, attributes: { uuid: [...uuids] } })
			}),
		)
		const firstByTagAndUuid = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
		for (const record of lookups.flat()) {
			const key = `${record.tagName} ${readAttribute({ record, name: 'uuid', defaults: 'none' })}`
			if (!firstByTagAndUuid.has(key)) firstByTagAndUuid.set(key, record)
		}
		for (const index of pending) {
			const key = `${sought[index].targetTagNames[round]} ${sought[index].uuid}`
			found[index] = firstByTagAndUuid.get(key)
		}
		pending = pending.filter(
			(index) => found[index] === undefined && round + 1 < sought[index].targetTagNames.length,
		)
	}
	return found
}
