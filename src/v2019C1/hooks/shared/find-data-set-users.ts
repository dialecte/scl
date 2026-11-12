import { DATA_SET_USER_TAGS } from './data-set-rename.constants'

import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { readAttribute } from '@/v2019C1/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The native controls of the exact logical node naming this DataSet, not controls of another scope or namespace. */
export async function findDataSetUsers(
	query: Core.Query<Config>,
	params: { dataSet: Scl.Ref<'DataSet'>; name?: string },
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const dataSet = await query.getRecord(params.dataSet)
	if (!dataSet?.parent) return []
	const definition = resolveDefinition({ dialecteConfig: SCL_DIALECTE_CONFIG, record: dataSet })
	if (dataSet.namespace.uri !== definition?.namespace.uri) return []
	const name = params.name ?? (await query.getAttribute(dataSet, { name: 'name' }))
	const parent = await query.getRecord(dataSet.parent as Scl.Ref<Scl.ElementsOf>)
	if (!parent || (parent.tagName !== 'LN' && parent.tagName !== 'LN0')) return []
	const parentDefinition = resolveDefinition({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		record: parent,
	})
	if (parent.namespace.uri !== parentDefinition?.namespace.uri) return []
	const refs = parent.children.filter((child) => DATA_SET_USER_TAGS.has(child.tagName))
	const records = await query.getRecords(refs as Scl.Ref<Scl.ElementsOf>[])
	return records.filter((record): record is Scl.TrackedRecord<Scl.ElementsOf> => {
		if (!record) return false
		const definition = resolveDefinition({ dialecteConfig: SCL_DIALECTE_CONFIG, record })
		return (
			record.namespace.uri === definition?.namespace.uri &&
			readAttribute({ record, name: 'datSet', defaults: 'none' }) === name
		)
	})
}
