import { ensureSubstationTemplateStructure } from './ensure-substation-structure'
import { FSD_OMIT } from './omit'
import { postExtractionCleanup } from './post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'

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

	const functionMappings = await cloneFunction(tx, {
		sourceQuery,
		functionRef,
		targetParentRef: substationRef,
		omit: FSD_OMIT,
		stripRootAttributes: ['templateUuid'],
	})

	const categoryMappings = await cloneFunctionCategories(tx, {
		sourceQuery,
		functionRef,
		structure,
	})

	// Repoint cloned uuid refs (e.g. FunctionCatRef -> the cloned Function) across ALL
	// clones of this operation, before cleanup reads those refs to detect orphans.
	await applyUuidRemap(tx, { mappings: [...functionMappings, ...categoryMappings] })

	await postExtractionCleanup(tx)
}
