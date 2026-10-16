import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE, MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference'
import { buildReferenceAttributes } from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import { derivedAttributesFollowing } from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import {
	hasAttributeChange,
	readSnapshotAttribute,
	updatedOperation,
	withAttributeValues,
} from '@/v2019C1/hooks/shared/record-ops'
import { findTargetByUuid } from '@/v2019C1/hooks/shared/ref-entry-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { AttributeList } from '@/v2019C1/hooks/shared/record-ops'
import type * as Core from '@dialecte/core'

/**
 * When a reference element's own binding attributes change (its companion DO/DA
 * name, its target uuid, its path, or an attribute it writes from the target's path such as a
 * terminal's level names), rebuild what it holds for the resolved target so the name
 * reference stays in agreement with the uuid reference.
 *
 * Skips `unsupported` paths (e.g. `VariableApplyTo` XPaths), which must not be
 * regenerated as plain name-paths, and mapped-name refs (`DOS`/`SDS`/`DAS`), which
 * are reconciled separately. Everything rebuilt lands in one update of the record:
 * an update per pair would each start from the same attributes and only the last would stay.
 */
export async function reconcileReferrerRefPaths(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params

	if (MAPPED_NAME_REFS.has(newRecord.tagName)) return []
	const pairs: readonly ReferencePair[] | undefined =
		UUID_REFERENCE_PAIRS[newRecord.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return []

	const reference = { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<Scl.ElementsOf>

	let attributes: AttributeList = newRecord.attributes
	for (const pair of pairs) {
		if (pair.resolution === RESOLUTION_TYPE.unsupported) continue
		const names = bindingAttributeNames({ tagName: newRecord.tagName, pair })
		if (!hasAttributeChange({ oldRecord, newRecord, names })) continue

		const uuid = readSnapshotAttribute({ record: newRecord, name: pair.attribute.uuid })
		const target = uuid
			? await findTargetByUuid(query, { uuid, targetTagNames: pair.target })
			: undefined
		if (!target) continue

		const values = await buildReferenceAttributes(query, { reference, target })
		attributes = withAttributeValues(attributes, values)
	}
	if (attributes === newRecord.attributes) return []
	return [updatedOperation(newRecord, attributes)]
}

/**
 * The attributes whose change rebinds the pair: its uuid, its path (the uuid wins: a path removed or
 * edited while the uuid names a target is written again), its companions, the attributes it writes.
 */
function bindingAttributeNames(params: { tagName: string; pair: ReferencePair }): string[] {
	const { tagName, pair } = params
	const derived = derivedAttributesFollowing({ tagName, follows: pair.attribute.path })
	return [
		pair.attribute.uuid,
		pair.attribute.path,
		...pair.companions.map((companion) => companion.name),
		...(derived?.attributes.map((attribute) => attribute.name) ?? []),
	]
}
