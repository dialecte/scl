import { assertFunctionTemplateHolds, placeFunction } from './function-placement'
import { keepsSection, omitOfSections } from './function-sections'
import { postExtractionCleanup } from './post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import { removeOwnProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { FsdExtractOptions } from './extract.types'
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
	} & FsdExtractOptions,
): Promise<void> {
	const { sourceQuery, functionRef, tool, who, nameStructure, sections } = params
	const { as = 'new', templateLink = 'break', placement = 'source-level' } = params
	const omit = omitOfSections({ sections })
	const withCategories = keepsSection({ sections, section: 'categories' })

	const functionName =
		(await sourceQuery.getAttribute(functionRef, { name: 'name' })) || 'Unnamed Function'

	await history.transaction.startFile(tx, {
		as,
		filename: `FSD_${functionName.replace(/\s+/g, '_')}`,
		header: {
			fileType: 'FSD',
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: 'FSD initialization',
			why: 'Function was extracted from a previous file',
		},
	})

	if (placement === 'function-template') {
		const withOwnProvenance = templateLink === 'keep'
		await assertFunctionTemplateHolds(sourceQuery, {
			functionRef,
			omit,
			withCategories,
			withOwnProvenance,
		})
	}

	const { parent, structure, asTemplate } = await placeFunction(tx, {
		sourceQuery,
		functionRef,
		placement,
	})

	const functionMappings = await cloneFunction(tx, {
		sourceQuery,
		functionRef,
		targetParentRef: parent,
		omit,
		asTemplate,
	})

	const { cloneMappings: categoryMappings, redirectMappings } = withCategories
		? await cloneFunctionCategories(tx, { sourceQuery, functionRef, structure })
		: { cloneMappings: [], redirectMappings: [] }

	// the function extracted is a new template: its own template link is broken unless the consumer keeps it, what
	// it holds keeps its lineage (a subfunction may be instantiated from another FSD); the cloned uuid refs (e.g.
	// FunctionCatRef -> the cloned Function) are repointed across ALL clones of this operation, before cleanup reads
	// them to detect orphans
	await finalizeClonedIdentity(tx, {
		cloneMappings: [...functionMappings, ...categoryMappings],
		mode: 'strip',
		unlinked: new Set(templateLink === 'break' ? [functionRef.id] : []),
		redirectMappings,
	})
	// nor does it record the file it was placed from any more; what it holds keeps the files it records
	const root = functionMappings.find((mapping) => mapping.source.id === functionRef.id)?.target
	if (root && templateLink === 'break') await removeOwnProvenance(tx, { element: root })

	await postExtractionCleanup(tx)
}
