import { MAPPING_DOCUMENTATION_TAGS, SPECIFICATION_LINK_TAGS } from './ied-process.constants'

import { toRef } from '@dialecte/core/helpers'

import {
	KEEP_ON_ORPHAN_REFS,
	SPECIFIED_NAMING_ATTRIBUTES,
	UUID_REFERENCE_PAIRS,
} from '@/v2019C1/constants'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'

import type {
	ReferencePair,
	ProcessEdit,
	ProcessIndex,
	ProcessNaming,
	ProcessStepResult,
} from './ied-process.types'
import type { Scl } from '@/v2019C1/config'
import type { SectionNode } from '@/v2019C1/extensions/dataflow/query/section-node.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * What changes on the written process part. A specification of an input or an output, a behaviour variable or a process
 * echo naming what the file does not hold keeps its expected data and loses that link (its uuid, its path and what
 * names the data there); an input or output specification gets the expected data it lacked from what it named, and is
 * said. A data specification loses its mapping to the implementing logical node. A written LNode gets its own naming as
 * its specified naming.
 */
export function planProcessEdits(params: {
	index: ProcessIndex
	kept: ReadonlySet<string>
	lnodes: ReadonlySet<string>
	iedUuids: ReadonlySet<string>
}): Pick<ProcessStepResult, 'warnings'> & { edits: ProcessEdit[]; namings: ProcessNaming[] } {
	const { index, kept, lnodes } = params
	const written = writtenUuids({ index, kept, iedUuids: params.iedUuids })
	const edits: ProcessEdit[] = []
	const warnings: ProcessStepResult['warnings'] = []
	for (const id of kept) {
		const node = index.byId.get(id)
		if (!node) continue
		const cut = cutLinks({ node, index, kept, written })
		const mapping = mappingRemoval(node.record)
		const attributes = { ...cut?.attributes, ...mapping }
		if (Object.keys(attributes).length === 0) continue
		edits.push({ ref: node.ref, attributes })
		if (cut && SPECIFICATION_LINK_TAGS.has(node.record.tagName))
			warnings.push({
				code: 'process-reference-cut',
				source: { tagName: node.record.tagName as 'SourceRef' | 'ControlRef', id },
				attributes: cut.removed,
			})
	}
	const namings = [...lnodes]
		.filter(function isWritten(id) {
			return kept.has(id)
		})
		.map(function namingOf(id) {
			return specifiedNaming({ index, lnode: id })
		})
	return { edits, namings, warnings }
}

/** The uuids of what the file holds that a process reference may name: the written section, the IED part. */
function writtenUuids(params: {
	index: ProcessIndex
	kept: ReadonlySet<string>
	iedUuids: ReadonlySet<string>
}): ReadonlySet<string> {
	const uuids = new Set(params.iedUuids)
	for (const id of params.kept) {
		const record = params.index.byId.get(id)?.record
		const uuid = record && readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (uuid) uuids.add(uuid)
	}
	return uuids
}

/** The links of a reference whose content is its own to what is not written: cleared, the expected data kept or filled. */
function cutLinks(params: {
	node: SectionNode
	index: ProcessIndex
	kept: ReadonlySet<string>
	written: ReadonlySet<string>
}): { attributes: Record<string, string | undefined>; removed: string[] } | undefined {
	const { node, index, kept, written } = params
	const { record } = node
	if (!KEEP_ON_ORPHAN_REFS.has(record.tagName) || isMappingDocumentation(record.tagName))
		return undefined
	const attributes: Record<string, string | undefined> = {}
	const removed: string[] = []
	const pairs: readonly ReferencePair[] =
		UUID_REFERENCE_PAIRS[record.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	for (const pair of pairs) {
		const target = cutTarget({ record, pair, index, kept, written })
		if (target === 'written') continue
		Object.assign(attributes, expectedData({ record, pair, target }))
		for (const name of linkAttributes(pair)) {
			if (!readAttribute({ record, name, defaults: 'none', fullObject: true })) continue
			attributes[name] = undefined
			removed.push(name)
		}
	}
	return removed.length > 0 ? { attributes, removed: removed.toSorted() } : undefined
}

/** What a link of a reference names: `written`, or, when cut, the element of the section it named, if any. */
function cutTarget(params: {
	record: AnyRawRecord
	pair: ReferencePair
	index: ProcessIndex
	kept: ReadonlySet<string>
	written: ReadonlySet<string>
}): 'written' | SectionNode | undefined {
	const { record, pair, index, kept, written } = params
	const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
	const path = readAttribute({ record, name: pair.attribute.path, defaults: 'none' })
	if (uuid) return written.has(uuid) ? 'written' : index.byUuid.get(uuid)
	if (!path) return 'written'
	const target = index.byPath.get(path)
	return target && kept.has(target.record.id) ? 'written' : target
}

/** The expected data an input or output specification lacks, from the LNode its cut link named. */
function expectedData(params: {
	record: AnyRawRecord
	pair: ReferencePair
	target: SectionNode | undefined
}): Record<string, string> {
	const { record, pair, target } = params
	if (
		!SPECIFICATION_LINK_TAGS.has(record.tagName) ||
		!(pair.target as readonly string[]).includes('LNode')
	)
		return {}
	const attributes = readAttributes({ record, defaults: 'none' }) as Record<
		string,
		string | undefined
	>
	const [objectName, attributeName] = pair.companions.map(function valueOf(companion) {
		return attributes[companion.name]
	})
	const lnClass =
		target && readAttribute({ record: target.record, name: 'lnClass', defaults: 'none' })
	const filled: Record<string, string> = {}
	if (!attributes.pLN && lnClass) filled.pLN = lnClass
	if (!attributes.pDO && objectName) filled.pDO = objectName
	if (record.tagName === 'SourceRef' && !attributes.pDA && attributeName) filled.pDA = attributeName
	return filled
}

/** The attributes of a link: its uuid, its path, and what names the data at its target. */
function linkAttributes(pair: ReferencePair): string[] {
	return [
		pair.attribute.uuid,
		pair.attribute.path,
		...pair.companions.map(function nameOf(companion) {
			return companion.name
		}),
	]
}

function isMappingDocumentation(tagName: string): boolean {
	return (MAPPING_DOCUMENTATION_TAGS as readonly string[]).includes(tagName)
}

/** A data specification's mapping attributes, removed. */
function mappingRemoval(record: AnyRawRecord): Record<string, undefined> {
	if (!isMappingDocumentation(record.tagName)) return {}
	const removal: Record<string, undefined> = {}
	for (const pair of UUID_REFERENCE_PAIRS[
		record.tagName as (typeof MAPPING_DOCUMENTATION_TAGS)[number]
	]) {
		for (const name of [pair.attribute.uuid, pair.attribute.path]) {
			if (readAttribute({ record, name, defaults: 'none', fullObject: true }))
				removal[name] = undefined
		}
	}
	return removal
}

/** The naming of a written LNode, written on its specified naming; an attribute the LNode lacks is removed there. */
function specifiedNaming(params: { index: ProcessIndex; lnode: string }): ProcessNaming {
	const { index, lnode } = params
	const record = index.byId.get(lnode)?.record
	const naming = (index.childrenOf.get(lnode) ?? []).find(function isSpecNaming(child) {
		return child.record.tagName === 'LNodeSpecNaming'
	})
	const lnodeAttributes = record
		? (readAttributes({ record, defaults: 'none' }) as Record<string, string | undefined>)
		: {}
	const attributes: Record<string, string | undefined> = {}
	for (const [name, specified] of SPECIFIED_NAMING_ATTRIBUTES)
		attributes[specified] = lnodeAttributes[name]
	return {
		lnode: { tagName: 'LNode', id: lnode },
		specNaming: naming && (toRef(naming.record) as Scl.Ref<'LNodeSpecNaming'>),
		attributes,
	}
}
