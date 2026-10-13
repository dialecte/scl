import { REAL_DEVICE_FILE_EXTENSION, REAL_DEVICE_FILE_TYPES } from './classify-ieds.constants'

import type { IedClassification, IedTreeNode } from './classify-ieds.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Classify every IED, in document order, as a real device's IED (`implemented`) or one written to
 * specify a device (`specification`). An IED is implemented when an ICD or IID file is among its
 * own source files (`IEDSourceFiles`, a reference in the document header does not count), or when
 * the document itself is an ICD file; any other IED is a specification IED.
 */
export async function classifyIeds(query: Core.Query<Config>): Promise<IedClassification[]> {
	const root = await query.getTree(
		{ tagName: 'SCL' },
		{ select: { IED: { IEDSourceFiles: { SclFileReference: true } } } },
	)
	const iedNodes = ((root?.tree ?? []) as IedTreeNode[]).filter((node) => node.tagName === 'IED')
	const { extension } = await query.getDocumentInfo()
	const inIcdFile = extension.toLowerCase() === REAL_DEVICE_FILE_EXTENSION

	const classifications: IedClassification[] = []
	for (const node of iedNodes) {
		const ied: Scl.Ref<'IED'> = { tagName: 'IED', id: node.id }
		const { name = '' } = await query.getAttributes(ied)
		classifications.push({ ied, name, ...(await classifyOne({ query, node, inIcdFile })) })
	}
	return classifications
}

async function classifyOne(params: {
	query: Core.Query<Config>
	node: IedTreeNode
	inIcdFile: boolean
}): Promise<Pick<IedClassification, 'kind' | 'basis'>> {
	const { query, node, inIcdFile } = params
	if (inIcdFile) return { kind: 'implemented', basis: 'icd-file' }

	const fileTypes = await readSourceFileTypes(query, node)
	const describesRealDevice = fileTypes.some((fileType) => REAL_DEVICE_FILE_TYPES.has(fileType))
	return describesRealDevice
		? { kind: 'implemented', basis: 'provenance' }
		: { kind: 'specification', basis: 'no-provenance' }
}

async function readSourceFileTypes(
	query: Core.Query<Config>,
	iedNode: IedTreeNode,
): Promise<string[]> {
	const references = iedNode.tree
		.filter((child) => child.tagName === 'IEDSourceFiles')
		.flatMap((child) => child.tree.filter((leaf) => leaf.tagName === 'SclFileReference'))

	const fileTypes: string[] = []
	for (const reference of references) {
		const { fileType } = await query.getAttributes({
			tagName: 'SclFileReference',
			id: reference.id,
		})
		if (fileType) fileTypes.push(fileType)
	}
	return fileTypes
}
