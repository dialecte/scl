import { ensureSubstationTemplateStructure } from '../shared/ensure-substation-structure'
import { postExtractionCleanup } from '../shared/post-extraction-cleanup'
import { FSD_OMIT } from './omit'

import { history } from '@/v2019C1/extensions/history'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function fsd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		who: Scl.AttributesValueObjectOf<'Hitem'>['who']
		nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	},
): Promise<void> {
	const { sourceQuery, functionRef, tool, who, nameStructure } = params
	const structure = await ensureSubstationTemplateStructure(tx)
	const substationRef = {
		tagName: structure.Substation.tagName,
		id: structure.Substation.id,
	} as const

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

	await cloneFunction(tx, {
		sourceQuery,
		functionRef,
		targetParentRef: substationRef,
		omit: FSD_OMIT,
		stripRootAttributes: ['templateUuid'],
	})

	await cloneFunctionCategories(tx, {
		sourceQuery,
		functionRef,
		structure,
	})

	await postExtractionCleanup(tx)
}
