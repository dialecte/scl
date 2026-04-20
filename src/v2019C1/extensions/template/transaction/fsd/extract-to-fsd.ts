import { ensureSubstationTemplateStructure } from '../../transaction/ensure-substation-structure'
import { cloneFunctionWithCategories } from '../shared/clone-function'
import { FSD_EXCLUDE } from '../shared/exclude-filters'
import { postExtractionCleanup } from '../shared/post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'

import type { Scl } from '@/v2019C1/config'

export async function extractToFsd(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		who: Scl.AttributesValueObjectOf<'Hitem'>['who']
		nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	},
): Promise<void> {
	const { sourceQuery, functionRef, tool, who, nameStructure } = params
	const { Substation } = await ensureSubstationTemplateStructure(tx)

	const functionName =
		(await sourceQuery.getAttribute(functionRef, { name: 'name' })) || 'Unnamed Function'

	await history.transaction.addEntry(tx, {
		filename: `FSD_${functionName.replace(/\s+/g, '_')}`,
		header: {
			fileType: 'FSD',
			version: 'keep',
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: 'FSD initialization',
			why: 'Function was extracted from a previous file',
		},
	})

	await cloneFunctionWithCategories(tx, {
		sourceQuery,
		functionRef,
		targetParentRef: { tagName: Substation.tagName, id: Substation.id },
		exclude: FSD_EXCLUDE,
	})

	await postExtractionCleanup(tx)
}
