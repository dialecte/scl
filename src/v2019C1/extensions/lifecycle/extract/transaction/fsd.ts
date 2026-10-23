import { ensureSubstationTemplateStructure } from './ensure-substation-structure'
import { FSD_OMIT } from './omit'
import { postExtractionCleanup } from './post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'

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
	})

	const { cloneMappings: categoryMappings, redirectMappings } = await cloneFunctionCategories(tx, {
		sourceQuery,
		functionRef,
		structure,
	})

	// the function extracted is a new template: its own template link is broken, what it holds keeps its lineage
	// (a subfunction may be instantiated from another FSD); the cloned uuid refs (e.g. FunctionCatRef -> the cloned
	// Function) are repointed across ALL clones of this operation, before cleanup reads them to detect orphans
	await finalizeClonedIdentity(tx, {
		cloneMappings: [...functionMappings, ...categoryMappings],
		mode: 'strip',
		unlinked: new Set([functionRef.id]),
		redirectMappings,
	})

	await postExtractionCleanup(tx)
}
