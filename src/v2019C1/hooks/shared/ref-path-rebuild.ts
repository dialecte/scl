import { toRawRecord } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE, MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference'
import { buildReferenceAttributes } from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import { buildSignalRoleAttributes } from '@/v2019C1/extensions/reference/query/build/build-signal-role-attributes'
import { derivedAttributesFollowing } from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import { readAttribute } from '@/v2019C1/helpers'
import { notePathEdit, pathEdits } from '@/v2019C1/hooks/shared/path-edits'
import { REQUIRED_PATHS } from '@/v2019C1/hooks/shared/path-references.constants'
import {
	hasAttributeChange,
	updatedOperation,
	withAttributeValues,
} from '@/v2019C1/hooks/shared/record-ops'
import { findTargetByUuid } from '@/v2019C1/hooks/shared/ref-entry-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type { DerivedAttributeValue, ReferencePair } from '@/v2019C1/extensions/reference'
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
		const edited = await pathEditOf({ oldRecord, newRecord, pair, query })
		if (edited) {
			attributes = withAttributeValues(attributes, edited)
			continue
		}
		// this pair's path edit waits for the commit, which resolves it with what else changed: no write-back from the
		// old uuid (a path removed since is written again from it, as any removed required path)
		if (isPathEditWaiting({ oldRecord, newRecord, pair, query })) continue

		const uuid = await query.any.getAttribute(newRecord, { name: pair.attribute.uuid })
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
 * Whether a pair's path edit, its uuid kept, waits for the commit: the transaction edited this pair's path, the path is
 * still there and this update keeps the uuid.
 */
function isPathEditWaiting(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	pair: ReferencePair
	query: Core.Query<Config>
}): boolean {
	const { oldRecord, newRecord, pair, query } = params
	const { uuid, path } = pair.attribute
	return (
		pathEdits({ query }).get(newRecord.id)?.has(path) === true &&
		readAttribute({ record: newRecord, name: path, defaults: 'none' }) !== '' &&
		!hasAttributeChange({ oldRecord, newRecord, names: [uuid] })
	)
}

/**
 * What a caller's edit of a pair's path, its uuid kept, writes now: for a removed path the definition does not require,
 * the uuid and the data names beside it (its companions) removed (an unbind); for an edited path, nothing (the uuid
 * kept until the commit resolves the path, `notePathEdit`). `undefined` when the edit is neither: a removed required
 * path is written again from the uuid (as any other binding change).
 */
async function pathEditOf(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	pair: ReferencePair
	query: Core.Query<Config>
}): Promise<DerivedAttributeValue[] | undefined> {
	const { oldRecord, newRecord, pair, query } = params
	const { uuid: uuidAttribute, path: pathAttribute } = pair.attribute
	if (hasAttributeChange({ oldRecord, newRecord, names: [uuidAttribute] })) return undefined
	if (!hasAttributeChange({ oldRecord, newRecord, names: [pathAttribute] })) return undefined
	if (!readAttribute({ record: newRecord, name: uuidAttribute, defaults: 'none' })) return undefined
	const path = readAttribute({ record: newRecord, name: pathAttribute, defaults: 'none' })
	if (!path) {
		const required = REQUIRED_PATHS.has(`${newRecord.tagName}@${pathAttribute}`)
		if (required) return undefined
		// the data it named on the target (its companions) goes with the binding
		return [uuidAttribute, ...pair.companions.map((companion) => companion.name)].map((name) => ({
			name,
			value: undefined,
		}))
	}
	// resolved at the commit, as the import resolves a path: the element may come later in the transaction
	notePathEdit({ query, recordId: newRecord.id, pathAttribute })
	return []
}

/**
 * When a `FunctionRef` is retargeted (its target uuid or its path changes), rebuild the signal role
 * references below it: their paths start at the function it names, so they follow it, whatever the
 * order the FunctionRef and the references were written in.
 */
export async function reconcileSignalRolePaths(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params
	const [pair] = UUID_REFERENCE_PAIRS.FunctionRef
	if (newRecord.tagName !== 'FunctionRef') return []
	if (
		!hasAttributeChange({ oldRecord, newRecord, names: [pair.attribute.uuid, pair.attribute.path] })
	) {
		return []
	}

	const rebuilt = await buildSignalRoleAttributes(query, {
		functionRef: { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<Scl.ElementsOf>,
	})
	const operations: Scl.Operation[] = []
	for (const { record, values } of rebuilt) {
		const raw = toRawRecord(record)
		const attributes = withAttributeValues(raw.attributes, values)
		if (attributes !== raw.attributes) operations.push(updatedOperation(raw, attributes))
	}
	return operations
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
