import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { buildMappedDataAttributes } from '@/v2019C1/extensions/reference/query/build/build-mapped-data-attributes'
import { buildMappedLNodePath } from '@/v2019C1/extensions/reference/query/build/build-mapped-lnode-path'
import { resolveMappedDataFrom } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-data-from'

import type {
	ImportedLNode,
	ImportedMappedDataNode,
	MappedDataImport,
} from './mapped-data-import.types'
import type { MappedDataSource } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-data-from.types'
import type { AnyRawRecord, ImportWarning, RecordPatch } from '@dialecte/core'

const DATA_TAGS: ReadonlySet<string> = new Set(['DOS', 'SDS'])

/**
 * Stores every `DOS` / `SDS` / `DAS` of an imported file in canonical form, with the same rules
 * as the record hooks: nothing when the record is implemented by its default, otherwise the
 * path from the implementing logical node with that node's uuid. The import has no store
 * access, so the pass collects what the rules need and resolves it at the end.
 */
export function createMappedDataImport(): MappedDataImport {
	const nodes = new Map<string, ImportedMappedDataNode>()
	const lnodes = new Map<string, ImportedLNode>()
	const lnUuids = new Set<string>()

	function collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		const attributes = readAttributes(record)

		if (record.tagName === 'LN' || record.tagName === 'LN0') {
			if (attributes.uuid) lnUuids.add(attributes.uuid)
			return
		}

		if (record.tagName === 'LNode') {
			const { lnUuid, iedName, ldInst, prefix, lnClass, lnInst } = attributes
			lnodes.set(record.id, { lnUuid, iedName, ldInst, prefix, lnClass, lnInst })
			return
		}

		const attributeNames = MAPPED_NAME_REFS.get(record.tagName)
		if (!attributeNames) return

		nodes.set(record.id, {
			tagName: record.tagName as ImportedMappedDataNode['tagName'],
			name: attributes.name,
			ix: attributes.ix,
			mappedName: attributes[attributeNames.path],
			mappedLnUuid: attributes[attributeNames.uuid],
			parent: ancestry.findLast((ancestor) => DATA_TAGS.has(ancestor.tagName))?.id,
			lnodeId: ancestry.findLast((ancestor) => ancestor.tagName === 'LNode')?.id,
		})
	}

	async function resolve(params: { pathIndex: ReadonlyMap<string, string> }): Promise<{
		updates: RecordPatch[]
		warnings: ImportWarning[]
	}> {
		const { pathIndex } = params

		function findLnByUuid(uuid: string): string | undefined {
			return lnUuids.has(uuid) ? uuid : undefined
		}

		function findLnByPath(path: string): string | undefined {
			const uuid = pathIndex.get(path)
			return uuid ? findLnByUuid(uuid) : undefined
		}

		const source: MappedDataSource<string, string> = {
			async readNode(nodeId) {
				return nodes.get(nodeId)
			},
			async findLNodeLn(nodeId) {
				const lnodeId = nodes.get(nodeId)?.lnodeId
				const lnode = lnodeId ? lnodes.get(lnodeId) : undefined
				if (!lnode) return undefined
				if (lnode.lnUuid) return findLnByUuid(lnode.lnUuid)
				const path = buildMappedLNodePath(lnode)
				return path ? findLnByPath(path) : undefined
			},
			async findLnByUuid(uuid) {
				return findLnByUuid(uuid)
			},
			async findLnByPath(path) {
				return findLnByPath(path)
			},
		}

		const updates: RecordPatch[] = []
		const warnings: ImportWarning[] = []

		for (const [recordId, node] of nodes) {
			if (!node.mappedName && !node.mappedLnUuid) continue
			const attributeNames = MAPPED_NAME_REFS.get(node.tagName)
			if (!attributeNames) continue

			const { mappedData, defaultData } = await resolveMappedDataFrom(source, { node: recordId })
			if (mappedData?.origin !== 'own') {
				warnings.push(unresolvedWarning({ recordId, node, attributeNames }))
				continue
			}

			const attributes = buildMappedDataAttributes({
				tagName: node.tagName,
				implementation: {
					lnId: mappedData.ln,
					lnUuid: mappedData.ln,
					dataPath: mappedData.dataPath,
				},
				defaultData: defaultData && { lnId: defaultData.ln, dataPath: defaultData.dataPath },
			})
			if (attributes.kind === 'inexpressible') continue

			if (attributes.kind === 'default') {
				updates.push({ recordId, removeAttributes: [attributeNames.path, attributeNames.uuid] })
				continue
			}

			const unchanged =
				node.mappedName === attributes.mappedName && node.mappedLnUuid === attributes.mappedLnUuid
			if (unchanged) continue
			updates.push({
				recordId,
				attributes: [
					{ name: attributeNames.path, value: attributes.mappedName },
					{ name: attributeNames.uuid, value: attributes.mappedLnUuid },
				],
			})
		}

		return { updates, warnings }
	}

	return { collect, resolve }
}

function readAttributes(record: AnyRawRecord): Record<string, string | undefined> {
	return Object.fromEntries(record.attributes.map((attribute) => [attribute.name, attribute.value]))
}

function unresolvedWarning(params: {
	recordId: string
	node: ImportedMappedDataNode
	attributeNames: { path: string; uuid: string }
}): ImportWarning {
	const { recordId, node, attributeNames } = params
	return {
		type: 'unresolved-reference',
		recordId,
		details: {
			elementTag: node.tagName,
			uuidAttribute: attributeNames.uuid,
			pathValue: node.mappedName ?? node.mappedLnUuid ?? '',
			triedKeys: [],
		},
	}
}
