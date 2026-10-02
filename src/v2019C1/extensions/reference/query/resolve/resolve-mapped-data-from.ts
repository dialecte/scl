import { splitLnodeQualifier } from './parse-path'

import type { MappedDataFrom, MappedDataSource } from './resolve-mapped-data-from.types'

/**
 * The data that implements a `DOS` / `SDS` / `DAS`, and the default it would follow if it
 * named nothing itself, read from any source (a document query, or an import index).
 *
 * A record that names its implementation (`mappedLnUuid`, `mappedDoName` / `mappedDaName`)
 * is implemented there; a `mappedLnUuid` alone keeps the default data path in that logical
 * node; a name without uuid is inside the logical node the `LNode` is mapped to, unless it
 * is an absolute reference. Otherwise the record follows its default: its parent data, or for
 * a `DOS` the logical node its `LNode` is mapped to, extended by its own name.
 */
export async function resolveMappedDataFrom<GenericNode, GenericLn>(
	source: MappedDataSource<GenericNode, GenericLn>,
	params: { node: GenericNode },
): Promise<MappedDataFrom<GenericLn>> {
	const { node } = params
	const record = await source.readNode(node)
	if (!record?.name) return {}

	const defaultData = await resolveDefaultData(source, {
		node,
		name: record.name,
		ix: record.ix,
		parent: record.parent,
	})
	if (!defaultData) return {}

	const mappedReference = record.mappedName ? splitMappedName(record.mappedName) : undefined

	if (record.mappedLnUuid) {
		const ln = await source.findLnByUuid(record.mappedLnUuid)
		if (!ln) return { defaultData }
		const dataPath = mappedReference?.dataPath ?? defaultData.dataPath
		return { mappedData: { ln, dataPath, origin: 'own' }, defaultData }
	}

	if (mappedReference) {
		const ln = mappedReference.lnPath
			? await source.findLnByPath(mappedReference.lnPath)
			: await source.findLNodeLn(node)
		if (!ln) return { defaultData }
		return { mappedData: { ln, dataPath: mappedReference.dataPath, origin: 'own' }, defaultData }
	}

	if (!defaultData.ln) return { defaultData }
	return {
		mappedData: { ln: defaultData.ln, dataPath: defaultData.dataPath, origin: 'default' },
		defaultData,
	}
}

async function resolveDefaultData<GenericNode, GenericLn>(
	source: MappedDataSource<GenericNode, GenericLn>,
	params: { node: GenericNode; name: string; ix?: string; parent?: GenericNode },
): Promise<MappedDataFrom<GenericLn>['defaultData']> {
	const { node, name, ix, parent } = params
	const segment = ix === undefined ? name : `${name}(${ix})`

	if (parent !== undefined) {
		const parentData = await resolveMappedDataFrom(source, { node: parent })
		if (parentData.mappedData) {
			return {
				ln: parentData.mappedData.ln,
				dataPath: [...parentData.mappedData.dataPath, segment],
			}
		}
		if (!parentData.defaultData) return undefined
		return { dataPath: [...parentData.defaultData.dataPath, segment] }
	}

	const ln = await source.findLNodeLn(node)
	return { ln, dataPath: [segment] }
}

/**
 * Split a mapped name into its logical node part (`IED/LD/LN`, present only in the absolute
 * form) and its data path (`DO.da`).
 */
function splitMappedName(mappedName: string): { lnPath?: string; dataPath: readonly string[] } {
	if (!mappedName.includes('/')) return { dataPath: mappedName.split('.') }
	const { path, qualifier } = splitLnodeQualifier(mappedName)
	return { lnPath: path, dataPath: qualifier ? qualifier.split('.') : [] }
}
