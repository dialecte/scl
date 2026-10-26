import { REFERENCE_UUID_ATTRIBUTES } from './group-linked-units.constants'

import { widen } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'

import type { UnitContent } from './group-linked-units.types'
import type { SsdScopeUnit } from './resolve-ssd-scope.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'

/**
 * The units of one level of a template, grouped by the references between them: a unit holding a reference to an
 * element another unit holds (a terminal on a connectivity node of the other level, an input fed by its logical node)
 * is linked to it, transitively. Each group, in the units' order, is one element to instantiate.
 */
export async function groupLinkedUnits(
	query: Core.Query<Config>,
	params: { units: readonly SsdScopeUnit[] },
): Promise<SsdScopeUnit[][]> {
	const { units } = params
	const contents: UnitContent[] = []
	for (const unit of units) contents.push(await readUnitContent(query, { unit }))

	// each unit starts as its own group; a reference into another unit merges the two
	const groupOf = units.map((_, index) => index)
	for (const [index, content] of contents.entries()) {
		for (const [other, otherContent] of contents.entries()) {
			if (other === index) continue
			if (![...content.referenced].some((uuid) => otherContent.uuids.has(uuid))) continue
			const merged = groupOf[other]
			const into = groupOf[index]
			for (const [unitIndex, group] of groupOf.entries())
				if (group === merged) groupOf[unitIndex] = into
		}
	}

	const groups = new Map<number, SsdScopeUnit[]>()
	for (const [index, unit] of units.entries()) {
		const group = groups.get(groupOf[index]) ?? []
		group.push(unit)
		groups.set(groupOf[index], group)
	}
	return [...groups.values()]
}

/** The uuids a unit's elements carry, and the uuids its references name. */
async function readUnitContent(
	query: Core.Query<Config>,
	params: { unit: SsdScopeUnit },
): Promise<UnitContent> {
	const content: UnitContent = { uuids: new Set(), referenced: new Set() }
	const { unit } = params
	const root = await query.getRecord({
		tagName: unit.tagName,
		id: unit.id,
	} as Scl.Ref<TopologyStructuralTag>)
	if (root) await collectContent(query, { record: widen(root), content })
	return content
}

async function collectContent(
	query: Core.Query<Config>,
	params: {
		record: Scl.RawRecord<Scl.ElementsOf>
		content: UnitContent
	},
): Promise<void> {
	const { record, content } = params
	const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
	if (uuid) content.uuids.add(uuid)
	for (const name of REFERENCE_UUID_ATTRIBUTES.get(record.tagName) ?? []) {
		const referenced = readAttribute({ record, name, defaults: 'none' })
		if (referenced) content.referenced.add(referenced)
	}
	for (const childRef of record.children) {
		const child = await query.getRecord(childRef)
		if (child) await collectContent(query, { record: child, content })
	}
}
