import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { buildMappedDataAttributes } from '@/v2019C1/extensions/reference/query/build/build-mapped-data-attributes'
import { buildMappedLNodePath } from '@/v2019C1/extensions/reference/query/build/build-mapped-lnode-path'
import { splitLnodeQualifier } from '@/v2019C1/extensions/reference/query/resolve/parse-path'
import { resolveMappedDataFrom } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-data-from'
import { readAttributes } from '@/v2019C1/helpers'
import {
	incoherentReferenceDiagnostic,
	incoherentReferenceRelated,
	unresolvedReferenceDiagnostic,
} from '@/v2019C1/hooks/io/import-diagnostic-builders'

import type {
	ImportedLNode,
	ImportedMappedDataNode,
	MappedDataImport,
	MappedDataImportDiagnostic,
} from './mapped-data-import.types'
import type {
	IncoherentReferenceDiagnostic,
	UnresolvedReferenceDiagnostic,
} from '@/v2019C1/errors/import-diagnostics.types'
import type { MappedDataSource } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-data-from.types'
import type { AnyRawRecord, DiagnosticRef, RecordPatch } from '@dialecte/core'

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
	/** Every `LN` / `LN0` of the file with a uuid, by uuid: what a diagnostic naming one points at. */
	const lnsByUuid = new Map<string, DiagnosticRef>()

	function collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		const attributes = readAttributes({ record, defaults: 'none' })

		if (record.tagName === 'LN' || record.tagName === 'LN0') {
			if (attributes.uuid)
				lnsByUuid.set(attributes.uuid, { tagName: record.tagName, id: record.id })
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

	async function resolve(params: {
		pathIndex: ReadonlyMap<string, string>
	}): ReturnType<MappedDataImport['resolve']> {
		const { pathIndex } = params

		function findLnByUuid(uuid: string): string | undefined {
			return lnsByUuid.has(uuid) ? uuid : undefined
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
		const diagnostics: MappedDataImportDiagnostic[] = []

		for (const [recordId, node] of nodes) {
			if (!node.mappedName && !node.mappedLnUuid) continue
			const attributeNames = MAPPED_NAME_REFS.get(node.tagName)
			if (!attributeNames) continue

			const { mappedData, defaultData } = await resolveMappedDataFrom(source, { node: recordId })
			if (mappedData?.origin !== 'own') {
				diagnostics.push(unresolvedDiagnostic({ recordId, node, attributeNames }))
				continue
			}

			// The uuid wins; an absolute name pointing at another logical node is reported.
			if (node.mappedName?.includes('/') && node.mappedLnUuid) {
				const namedLn = findLnByPath(splitLnodeQualifier(node.mappedName).path)
				if (namedLn && namedLn !== node.mappedLnUuid) {
					diagnostics.push(
						incoherentDiagnostic({
							recordId,
							tagName: node.tagName,
							attributeNames,
							pathValue: node.mappedName,
							uuidValue: node.mappedLnUuid,
							uuidTarget: lnsByUuid.get(node.mappedLnUuid),
							pathTarget: lnsByUuid.get(namedLn),
						}),
					)
				}
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

		return { updates, diagnostics }
	}

	return { collect, resolve }
}

/**
 * Mapped data whose implementation the file does not hold: on its name attribute, or on its uuid
 * attribute when it is named by its uuid alone.
 */
function unresolvedDiagnostic(params: {
	recordId: string
	node: ImportedMappedDataNode
	attributeNames: { path: string; uuid: string }
}): UnresolvedReferenceDiagnostic {
	const { recordId, node, attributeNames } = params
	return unresolvedReferenceDiagnostic({
		ref: {
			tagName: node.tagName,
			id: recordId,
			attribute: node.mappedName ? attributeNames.path : attributeNames.uuid,
		},
		meta: {
			uuidAttribute: attributeNames.uuid,
			pathValue: node.mappedName ?? node.mappedLnUuid ?? '',
			triedKeys: [],
		},
	})
}

/**
 * Mapped data whose absolute name names another logical node than its uuid, with the logical nodes
 * involved, each when the file holds it.
 */
function incoherentDiagnostic(params: {
	recordId: string
	tagName: string
	attributeNames: { path: string; uuid: string }
	pathValue: string
	uuidValue: string
	uuidTarget: DiagnosticRef | undefined
	pathTarget: DiagnosticRef | undefined
}): IncoherentReferenceDiagnostic {
	const { recordId, tagName, attributeNames, pathValue, uuidValue, uuidTarget, pathTarget } = params
	return incoherentReferenceDiagnostic({
		ref: { tagName, id: recordId, attribute: attributeNames.path },
		meta: { uuidAttribute: attributeNames.uuid, pathValue, uuidValue },
		related: incoherentReferenceRelated({ uuidTarget, pathTarget }),
	})
}
