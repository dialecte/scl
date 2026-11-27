import { UNUSED_DATA_SECTION_SELECT } from '../constants/unused-data-section.constants'
import { nativeSectionNodesOf } from './section-nodes'

import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'

import type { IedNode } from './ied-section.types'
import type { UnusedDataSection } from './unused-data-section.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Reads publisher data and capabilities needed only by unused-data cleanup. */
export async function readUnusedDataSection(query: Core.Query<Config>): Promise<UnusedDataSection> {
	const collected = await collectWithAncestry(query, { select: UNUSED_DATA_SECTION_SELECT })
	const dataSets: IedNode<'DataSet'>[] = []
	const fcdas: IedNode<'FCDA'>[] = []
	const services: IedNode<'ConfDataSet' | 'GSESettings' | 'SMVSettings' | 'ReportSettings'>[] = []
	for (const sectionNode of nativeSectionNodesOf(collected)) {
		const node = inIed(sectionNode)
		if (!node) continue
		if (node.record.tagName === 'DataSet') dataSets.push(node as IedNode<'DataSet'>)
		if (node.record.tagName === 'FCDA') fcdas.push(node as IedNode<'FCDA'>)
		if (
			node.record.tagName === 'ConfDataSet' ||
			node.record.tagName === 'GSESettings' ||
			node.record.tagName === 'SMVSettings' ||
			node.record.tagName === 'ReportSettings'
		)
			services.push(
				node as IedNode<'ConfDataSet' | 'GSESettings' | 'SMVSettings' | 'ReportSettings'>,
			)
	}
	return { dataSets, fcdas, services }
}

function inIed(node: {
	ref: Scl.Ref<Scl.ElementsOf>
	record: Core.AnyRawRecord
	ancestry: readonly Core.AnyRawRecord[]
}): IedNode | undefined {
	const scope = [...node.ancestry, node.record]
	const ied = scope.find((record) => record.tagName === 'IED')
	if (!ied) return undefined
	const ldevice = scope.findLast((record) => record.tagName === 'LDevice')
	const ln = scope.findLast((record) => record.tagName === 'LN' || record.tagName === 'LN0')
	return {
		...node,
		ied: { tagName: 'IED', id: ied.id },
		ldevice: ldevice && { tagName: 'LDevice', id: ldevice.id },
		ln: ln && ({ tagName: ln.tagName, id: ln.id } as Scl.Ref<'LN' | 'LN0'>),
	}
}
