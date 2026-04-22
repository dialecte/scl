import { resolve } from '../query'

import type { ResolvedDataModel } from '../query/resolve.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function extract(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		records: (Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'>)[]
	},
): Promise<void> {
	const { sourceQuery, records } = params

	const resolved = await resolve(sourceQuery, { records })
	const typesToClone = collectTypes(resolved)

	const root = await tx.getRoot()
	const dataTypeTemplates = await tx.ensureChild(root, {
		tagName: 'DataTypeTemplates',
		attributes: {},
	})

	for (const record of typesToClone) {
		const id = await sourceQuery.getAttribute(record, { name: 'id' })
		if (!id) continue

		const [existing] = await tx.findByAttributes({
			tagName: record.tagName,
			attributes: { id },
		})
		if (existing) continue

		const tree = await sourceQuery.getTree(record)
		if (!tree) continue

		await tx.deepClone(dataTypeTemplates, tree)
	}
}

function collectTypes(
	resolved: ResolvedDataModel,
): Array<
	| Scl.TrackedRecord<'LNodeType'>
	| Scl.TrackedRecord<'DOType'>
	| Scl.TrackedRecord<'DAType'>
	| Scl.TrackedRecord<'EnumType'>
> {
	return [...resolved.lnodeTypes, ...resolved.doTypes, ...resolved.daTypes, ...resolved.enumTypes]
}
