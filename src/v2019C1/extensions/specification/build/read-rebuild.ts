import { UUID_REFERRERS_BY_TARGET } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { readAttributes } from '@/v2019C1/helpers'

import type { SectionElement, SpecNaming } from './build-input.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/** The specification naming of every LNode of the process section that has one, by LNode id (no store read). */
export function specNamingsOf(params: {
	nodes: readonly SectionElement[]
}): Map<string, SpecNaming> {
	const namings = new Map<string, SpecNaming>()
	for (const node of params.nodes) {
		if (node.record.tagName !== 'LNodeSpecNaming') continue
		const lnode = node.ancestry.findLast((ancestor) => ancestor.tagName === 'LNode')
		if (!lnode) continue
		const attributes = readAttributes({ record: node.record, defaults: 'none' })
		namings.set(lnode.id, {
			ref: { tagName: 'LNodeSpecNaming', id: node.record.id },
			prefix: attributes.sPrefix ?? '',
			lnClass: attributes.sLnClass ?? '',
			inst: attributes.sLnInst ?? '',
			ldInst: attributes.sLdInst ?? '',
			iedName: attributes.sIedName ?? '',
		})
	}
	return namings
}

/**
 * What names each of the logical node uuids given (an LNode, the binding, left out), by uuid: one lookup per referrer
 * tag for every uuid; nothing read when none is given.
 */
export async function readUsers(
	query: Core.Query<Config>,
	params: { uuids: readonly string[] },
): Promise<Map<string, Scl.Ref<Scl.ElementsOf>[]>> {
	const { uuids } = params
	const users = new Map<string, Scl.Ref<Scl.ElementsOf>[]>()
	if (uuids.length === 0) return users
	const referrers = [
		...new Map(
			(UUID_REFERRERS_BY_TARGET.get('LN') ?? [])
				.filter((referrer) => referrer.refTagName !== 'LNode')
				.map((referrer) => [`${referrer.refTagName} ${referrer.uuidAttr}`, referrer]),
		).values(),
	]
	const found = await Promise.all(
		referrers.map(function lookUp(referrer) {
			// dialecte-allow query-in-loop: one lookup per referrer tag the registry names, every uuid in each
			return query.any.findByAttributes({
				tagName: referrer.refTagName,
				attributes: { [referrer.uuidAttr]: [...uuids] },
			})
		}),
	)
	referrers.forEach(function usersBy(referrer, position) {
		for (const record of (found[position] ?? []) as AnyRawRecord[]) {
			const uuid = readAttributes({ record, defaults: 'none' })[referrer.uuidAttr]
			if (!uuid) continue
			const ref = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
			users.set(uuid, [...(users.get(uuid) ?? []), ref])
		}
	})
	return users
}
