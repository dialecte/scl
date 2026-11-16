import { constraintFields } from './find-constraint-violation'

import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ConstraintScope } from './find-constraint-violation.types'
import type { ScopesTellingTargetsApartParams } from './names-follow-targets.types'
import type * as Core from '@dialecte/core'

/**
 * The scope a candidate is compared in, one per constraint, without the siblings a tuple reference's names cannot
 * collide with: under a key made only of the names a tuple pair gives what it names (a `ConnectedAP`'s `iedName` and
 * `apName`), a sibling naming by uuid an element the document holds (`liveTargetUuids`), another one than the
 * candidate's, names another element. Its names follow that element (written from it at the commit, followed on a
 * rename), whatever they read now. A sibling or a candidate naming nothing by uuid, a sibling whose uuid names nothing,
 * or both naming the same element, is compared as before. Pure.
 */
export function scopesTellingTargetsApart(
	params: ScopesTellingTargetsApartParams,
): ConstraintScope[] {
	const { scope, tagName, candidate } = params
	const tuplePairs = (REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []).filter(
		(reference) => reference.form === 'tuple',
	)
	return scope.constraints.map(function scopeOf(constraint) {
		const fields = constraintFields(constraint)
		const pair = tuplePairs.find((reference) =>
			fields.every((field) => reference.names.includes(field)),
		)
		const candidateUuid = pair ? candidate[pair.uuid] : undefined
		if (!pair || !candidateUuid) return { constraints: [constraint], children: scope.children }
		const liveTargetUuids = scope.liveTargetUuids ?? new Set<string>()
		const children = scope.children.filter(function namesSameOrNoLiveTarget(child) {
			const uuid = uuidOf({ record: child, name: pair.uuid })
			return !uuid || uuid === candidateUuid || !liveTargetUuids.has(uuid)
		})
		return { constraints: [constraint], children }
	})
}

function uuidOf(params: { record: Core.AnyTreeRecord; name: string }): string | undefined {
	const { record, name } = params
	return readAttribute({ record, name, defaults: 'none', fullObject: true })?.value
}
