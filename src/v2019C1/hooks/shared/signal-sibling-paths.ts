import { toRawRecord } from '@dialecte/core/helpers'

import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { getRefEntriesForTarget, updateRefsForEntry } from '@/v2019C1/hooks/shared/ref-entry-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * A signal's name depends on the siblings that share it. When a signal of
 * `parent` is added, changed or removed, rebuild the paths of the references to its siblings
 * whose name is one of `names` (the name it had and the name it has).
 */
export async function reconcileSignalSiblingPaths(
	query: Core.Query<Config>,
	params: {
		parent: Scl.Ref<Scl.ElementsOf>
		tagName: string
		names: readonly string[]
	},
): Promise<Scl.Operation[]> {
	const { parent, tagName, names } = params

	const strategy = PATH_EXTRACTION_CONFIG[tagName]
	if (strategy?.type !== 'signal' || names.length === 0) return []

	const parentRecord = await query.getRecord(parent)
	if (!parentRecord) return []

	const children = await query.getRecords(parentRecord.children)
	const sharing = children
		.filter((child) => child !== undefined)
		.map(toRawRecord)
		.filter(
			(child) =>
				child.tagName === tagName &&
				names.includes(child.attributes.find((a) => a.name === strategy.name)?.value ?? ''),
		)

	const operations: Scl.Operation[] = []
	for (const sibling of sharing) {
		const uuid = sibling.attributes.find((a) => a.name === 'uuid')?.value
		if (!uuid) continue
		const target = { tagName: sibling.tagName, id: sibling.id } as Scl.Ref<Scl.ElementsOf>
		for (const entry of getRefEntriesForTarget(tagName)) {
			operations.push(...(await updateRefsForEntry({ uuid, entry, target, query })))
		}
	}
	return operations
}

/** The attributes a signal's name is built from (name, instance, data), empty for another tag. */
export function signalNamingAttributes(tagName: string): string[] {
	const strategy = PATH_EXTRACTION_CONFIG[tagName]
	if (strategy?.type !== 'signal') return []
	return [strategy.name, strategy.instance, ...(strategy.data ? [strategy.data] : [])]
}

/** The name a signal record carries, or `undefined` when the record is not a signal. */
export function signalName(record: Scl.RawRecord<Scl.ElementsOf>): string | undefined {
	const strategy = PATH_EXTRACTION_CONFIG[record.tagName]
	if (strategy?.type !== 'signal') return undefined
	return record.attributes.find((a) => a.name === strategy.name)?.value
}
