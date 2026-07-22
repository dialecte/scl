import { isChildOf } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import type { ResolvedDataModel, DataModelMap } from './resolve.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function resolve(
	query: Core.Query<Config>,
	params: {
		records: (Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'> | Scl.TrackedRecord<'LN0'>)[]
	},
): Promise<ResolvedDataModel> {
	const { records } = params

	const dataModelMap: DataModelMap = {
		lnodeTypes: new Map(),
		doTypes: new Map(),
		daTypes: new Map(),
		enumTypes: new Map(),
	}

	for (const record of records) {
		const lnType = await query.getAttribute(record, { name: 'lnType' })
		if (!lnType) continue

		const [lnodeType] = await query.findByAttributes({
			tagName: 'LNodeType',
			attributes: { id: lnType },
		})
		invariant(lnodeType, {
			key: 'ELEMENT_NOT_FOUND',
			detail: `LNodeType not found for lnType="${lnType}"`,
		})

		if (!addIfNew(dataModelMap.lnodeTypes, lnType, lnodeType)) continue

		const doRefs = lnodeType.children.filter((child) => isChildOf(child, 'DO'))
		const doElements = await query.getRecords(doRefs)

		for (const doElement of doElements) {
			if (!doElement) continue
			const doTypeId = await query.getAttribute(doElement, { name: 'type' })
			if (!doTypeId) continue

			const [doType] = await query.findByAttributes({
				tagName: 'DOType',
				attributes: { id: doTypeId },
			})
			if (!doType) continue

			if (addIfNew(dataModelMap.doTypes, doTypeId, doType)) {
				await resolveDataAttributes({ query, parent: doType, dataModelMap })
			}
		}
	}

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

async function resolveDataAttributes(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	parent: Scl.TrackedRecord<'DOType'> | Scl.TrackedRecord<'DAType'>
	dataModelMap: DataModelMap
}): Promise<void> {
	const { query, parent, dataModelMap } = params

	// Resolve DA or BDA children depending on parent type
	const dataAttributes =
		parent.tagName === 'DOType'
			? await query.getRecords(parent.children.filter((c) => isChildOf(c, 'DA')))
			: await query.getRecords(parent.children.filter((c) => isChildOf(c, 'BDA')))

	for (const da of dataAttributes) {
		if (!da) continue
		const bType = await query.getAttribute(da, { name: 'bType' })
		const typeId = await query.getAttribute(da, { name: 'type' })
		if (!typeId) continue

		if (bType === 'Enum') {
			const [enumType] = await query.findByAttributes({
				tagName: 'EnumType',
				attributes: { id: typeId },
			})
			if (enumType) addIfNew(dataModelMap.enumTypes, typeId, enumType)
		} else if (bType === 'Struct') {
			const [daType] = await query.findByAttributes({
				tagName: 'DAType',
				attributes: { id: typeId },
			})
			if (daType && addIfNew(dataModelMap.daTypes, typeId, daType)) {
				await resolveDataAttributes({ query, parent: daType, dataModelMap })
			}
		}
	}

	// Resolve SDO children (DOType only) — SDO references another DOType
	if (parent.tagName === 'DOType') {
		const sdoRefs = parent.children.filter((child) => isChildOf(child, 'SDO'))
		const sdoElements = await query.getRecords(sdoRefs)

		for (const sdo of sdoElements) {
			const sdoTypeId = await query.getAttribute(sdo, { name: 'type' })
			if (!sdoTypeId) continue

			const [sdoType] = await query.findByAttributes({
				tagName: 'DOType',
				attributes: { id: sdoTypeId },
			})
			if (!sdoType) continue

			if (addIfNew(dataModelMap.doTypes, sdoTypeId, sdoType)) {
				await resolveDataAttributes({ query, parent: sdoType, dataModelMap })
			}
		}
	}
}
