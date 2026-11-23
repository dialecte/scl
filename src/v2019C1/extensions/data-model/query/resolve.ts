import { readDataTypeRecords } from './read-data-type-records'

import { isChildOf } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { readAttribute } from '@/v2019C1/helpers'

import type { DataTypeRecords } from './read-data-type-records.types'
import type {
	ResolvedDataModel,
	DataModelMap,
	DataTypeMemberTag,
	DataTypeTag,
} from './resolve.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The data types behind LNodes and LNs: every LNodeType their `lnType` names (and every one `lnodeTypeIds` names), with the DOType,
 * DAType and EnumType it uses down the whole tree, each listed once. An `lnType` naming no
 * LNodeType fails.
 *
 * Perf: the data types are read level by level from the logical node types the records name (per
 * level one lookup by id list per type tag and one read of the members), whatever the number of
 * records, then walked in memory; only what the walk reaches is read.
 *
 * @intent data types used by an LNode or LN, LNodeType/DOType/DAType/EnumType closure of a logical node, collect the DataTypeTemplates of a selection
 */
export async function resolve(
	query: Core.Query<Config>,
	params: {
		records: (Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'> | Scl.TrackedRecord<'LN0'>)[]
		/** LNodeTypes walked from their id, after the types the records name, whether or not a record names them. */
		lnodeTypeIds?: readonly string[]
	},
): Promise<ResolvedDataModel> {
	const { records, lnodeTypeIds = [] } = params

	const dataModelMap: DataModelMap = {
		lnodeTypes: new Map(),
		doTypes: new Map(),
		daTypes: new Map(),
		enumTypes: new Map(),
	}
	let dataTypes: DataTypeRecords | undefined

	const named: string[] = []
	for (const record of records) {
		const lnType = await query.getAttribute(record, { name: 'lnType' })
		if (lnType) named.push(lnType)
	}
	const lnTypes = [...named, ...lnodeTypeIds.filter((id) => id !== '')]

	for (const lnType of lnTypes) {
		dataTypes ??= await readDataTypeRecords({
			query,
			lnTypes: [...new Set([...lnTypesOf({ records }), ...lnodeTypeIds])].filter((id) => id !== ''),
		})

		const lnodeType = await findType({ query, dataTypes, tagName: 'LNodeType', id: lnType })
		invariant(lnodeType, {
			key: 'ELEMENT_NOT_FOUND',
			detail: `LNodeType not found for lnType="${lnType}"`,
		})

		if (!addIfNew(dataModelMap.lnodeTypes, lnType, lnodeType)) continue

		const doElements = await membersOf({ query, dataTypes, parent: lnodeType, tagName: 'DO' })

		for (const doElement of doElements) {
			if (!doElement) continue
			const doTypeId = readAttribute({ record: doElement, name: 'type' })
			if (!doTypeId) continue

			const doType = await findType({ query, dataTypes, tagName: 'DOType', id: doTypeId })
			if (!doType) continue

			if (addIfNew(dataModelMap.doTypes, doTypeId, doType)) {
				await resolveDataAttributes({ query, dataTypes, parent: doType, dataModelMap })
			}
		}
	}

	return toResolved({ dataModelMap })
}

/** The types resolved, list by list, in the order they were reached. */
function toResolved(params: { dataModelMap: DataModelMap }): ResolvedDataModel {
	const { dataModelMap } = params
	return {
		lnodeTypes: Array.from(dataModelMap.lnodeTypes.values()),
		doTypes: Array.from(dataModelMap.doTypes.values()),
		daTypes: Array.from(dataModelMap.daTypes.values()),
		enumTypes: Array.from(dataModelMap.enumTypes.values()),
	}
}

function addIfNew<T>(map: Map<string, T>, id: string, record: T): boolean {
	if (map.has(id)) return false
	map.set(id, record)
	return true
}

/** The logical node types the records name, each once, as the records hold them. */
function lnTypesOf(params: {
	records: readonly (
		| Scl.TrackedRecord<'LNode'>
		| Scl.TrackedRecord<'LN'>
		| Scl.TrackedRecord<'LN0'>
	)[]
}): string[] {
	const { records } = params
	const lnTypes = records.map((record) => readAttribute({ record, name: 'lnType' }))
	return [...new Set(lnTypes.filter((lnType) => lnType !== ''))]
}

/**
 * The type of the tag named `id`, as a lookup by id answers it: the record read for that id; an id not read is
 * looked up in the store.
 */
async function findType<GenericTag extends DataTypeTag>(params: {
	query: Core.Query<Config>
	dataTypes: DataTypeRecords
	tagName: GenericTag
	id: string
}): Promise<Scl.TrackedRecord<GenericTag> | undefined> {
	const { query, dataTypes, tagName, id } = params
	const known = dataTypes.typesByTag.get(tagName)
	if (known?.has(id)) return known.get(id) as Scl.TrackedRecord<GenericTag> | undefined
	// the union, not the generic: `FilterAttributes` of an unresolved tag takes no attribute
	const [found] = await query.findByAttributes({
		tagName: tagName as DataTypeTag,
		attributes: { id },
	})
	return found as Scl.TrackedRecord<GenericTag> | undefined
}

/**
 * The children of `parent` of the tag, in its order, as `getRecords` answers them: from the members read, or from the
 * store for a type whose members were not read (its refusal, a wrong tag among them, stays the walk's).
 */
async function membersOf<GenericTag extends DataTypeMemberTag>(params: {
	query: Core.Query<Config>
	dataTypes: DataTypeRecords
	parent: Scl.TrackedRecord<'LNodeType'> | Scl.TrackedRecord<'DOType'> | Scl.TrackedRecord<'DAType'>
	tagName: GenericTag
}): Promise<(Scl.TrackedRecord<GenericTag> | undefined)[]> {
	const { query, dataTypes, parent, tagName } = params
	const refs = parent.children.filter((child) => isChildOf(child, tagName))
	if (!dataTypes.membersOf.has(parent.id)) {
		const live = await query.getRecords(refs as Scl.Ref<DataTypeMemberTag>[])
		return live as (Scl.TrackedRecord<GenericTag> | undefined)[]
	}
	return refs.map(
		(ref) => dataTypes.membersById.get(ref.id) as Scl.TrackedRecord<GenericTag> | undefined,
	)
}

async function resolveDataAttributes(params: {
	query: Core.Query<Config>
	dataTypes: DataTypeRecords
	parent: Scl.TrackedRecord<'DOType'> | Scl.TrackedRecord<'DAType'>
	dataModelMap: DataModelMap
}): Promise<void> {
	const { query, dataTypes, parent, dataModelMap } = params

	// Resolve DA or BDA children depending on parent type
	const dataAttributes =
		parent.tagName === 'DOType'
			? await membersOf({ query, dataTypes, parent, tagName: 'DA' })
			: await membersOf({ query, dataTypes, parent, tagName: 'BDA' })

	for (const da of dataAttributes) {
		if (!da) continue
		const bType = readAttribute({ record: da, name: 'bType' })
		const typeId = readAttribute({ record: da, name: 'type' })
		if (!typeId) continue

		if (bType === 'Enum') {
			const enumType = await findType({ query, dataTypes, tagName: 'EnumType', id: typeId })
			if (enumType) addIfNew(dataModelMap.enumTypes, typeId, enumType)
		} else if (bType === 'Struct') {
			const daType = await findType({ query, dataTypes, tagName: 'DAType', id: typeId })
			if (daType && addIfNew(dataModelMap.daTypes, typeId, daType)) {
				await resolveDataAttributes({ query, dataTypes, parent: daType, dataModelMap })
			}
		}
	}

	// Resolve SDO children (DOType only) — SDO references another DOType
	if (parent.tagName === 'DOType') {
		const sdoElements = await membersOf({ query, dataTypes, parent, tagName: 'SDO' })

		for (const sdo of sdoElements) {
			// an SDO listed by its DOType and not stored is an integrity error, refused as the query refuses an undefined record
			invariant(sdo, { key: 'ASSERTION_FAILED', detail: 'The record or ref is undefined' })
			const sdoTypeId = readAttribute({ record: sdo, name: 'type' })
			if (!sdoTypeId) continue

			const sdoType = await findType({ query, dataTypes, tagName: 'DOType', id: sdoTypeId })
			if (!sdoType) continue

			if (addIfNew(dataModelMap.doTypes, sdoTypeId, sdoType)) {
				await resolveDataAttributes({ query, dataTypes, parent: sdoType, dataModelMap })
			}
		}
	}
}
