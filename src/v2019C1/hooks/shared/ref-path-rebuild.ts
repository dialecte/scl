import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE, MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference'
import { buildReferencePath } from '@/v2019C1/extensions/reference/query/build'
import { updatedOperation, upsertAttribute } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * When a reference element's own binding attributes change (its companion DO/DA
 * name or its target uuid), rebuild its path attribute from the resolved target
 * so the name reference stays in agreement with the uuid reference.
 *
 * Skips `unsupported` paths (e.g. `VariableApplyTo` XPaths), which must not be
 * regenerated as plain name-paths, and mapped-name refs (`DOS`/`SDS`/`DAS`), which
 * are reconciled separately.
 */
export async function reconcileReferrerRefPaths(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params

	if (MAPPED_NAME_REFS.has(newRecord.tagName)) return []
	const pairs = UUID_REFERENCE_PAIRS[newRecord.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return []

	const operations: Scl.Operation[] = []
	for (const pair of pairs) {
		if (pair.resolution === RESOLUTION_TYPE.unsupported) continue
		if (!bindingAttrsChanged(oldRecord, newRecord, pair)) continue
		const operation = await rebuildRefPath({ newRecord, pair, query })
		if (operation) operations.push(operation)
	}
	return operations
}

/** True when the pair's uuid attribute or any of its companion names changed. */
function bindingAttrsChanged(
	oldRecord: Scl.RawRecord<Scl.ElementsOf>,
	newRecord: Scl.RawRecord<Scl.ElementsOf>,
	pair: ReferencePair,
): boolean {
	const names = [pair.attribute.uuid, ...pair.companions.map((companion) => companion.name)]
	return names.some((name) => attributeValue(oldRecord, name) !== attributeValue(newRecord, name))
}

async function rebuildRefPath(params: {
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	pair: ReferencePair
	query: Core.Query<Config>
}): Promise<Scl.Operation | null> {
	const { newRecord, pair, query } = params

	const uuidValue = attributeValue(newRecord, pair.attribute.uuid)
	if (!uuidValue) return null

	const target = await findTargetByUuid({ uuidValue, targetTagNames: pair.target, query })
	if (!target) return null

	const reference = { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<Scl.ElementsOf>
	const newPath = await buildReferencePath(query, { reference, target })
	if (!newPath) return null

	if (attributeValue(newRecord, pair.attribute.path) === newPath) return null

	const attributes = upsertAttribute(newRecord.attributes, pair.attribute.path, newPath)
	return updatedOperation(newRecord, attributes)
}

async function findTargetByUuid(params: {
	uuidValue: string
	targetTagNames: readonly string[]
	query: Core.Query<Config>
}): Promise<Scl.Ref<Scl.ElementsOf> | null> {
	const { uuidValue, targetTagNames, query } = params

	for (const targetTagName of targetTagNames) {
		if (!isElementOf(targetTagName, SCL_DIALECTE_CONFIG)) continue
		const candidates = await query.getRecordsByTagName(targetTagName)
		const match = candidates.find(
			(record) => record.attributes.find((a) => a.name === 'uuid')?.value === uuidValue,
		)
		if (match) return { tagName: match.tagName, id: match.id } as Scl.Ref<Scl.ElementsOf>
	}
	return null
}

function attributeValue(record: Scl.RawRecord<Scl.ElementsOf>, name: string): string | undefined {
	return record.attributes.find((a) => a.name === name)?.value
}
