import { ensureSubstationTemplateStructure } from './ensure-substation-structure'
import { postExtractionCleanup } from './post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'
import { ALWAYS_OMIT } from '@/v2019C1/extensions/lifecycle/layers/omit-filters'
import { removeOwnProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { ExtractOptions } from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function asd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		who: Scl.AttributesValueObjectOf<'Hitem'>['who']
		nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	} & ExtractOptions,
): Promise<void> {
	const { sourceQuery, applicationRef, tool, who, nameStructure } = params
	const { as = 'new', templateLink = 'break' } = params

	const applicationName =
		(await sourceQuery.getAttribute(applicationRef, { name: 'name' })) || 'Unnamed Application'

	await history.transaction.startFile(tx, {
		as,
		filename: `ASD_${applicationName.replace(/\s+/g, '_')}`,
		header: {
			fileType: 'ASD',
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: 'ASD initialization',
			why: 'Application was extracted from a previous file',
		},
	})

	const structure = await ensureSubstationTemplateStructure(tx)

	const { cloneMappings, redirectMappings } = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
		omit: ALWAYS_OMIT,
	})

	// the application extracted is a new template: its own template link is broken unless the consumer keeps it,
	// what it composes keeps its lineage; the cloned uuid refs are repointed across ALL clones, before cleanup reads
	// them to detect orphans
	await finalizeClonedIdentity(tx, {
		cloneMappings,
		mode: 'strip',
		unlinked: new Set(templateLink === 'break' ? [applicationRef.id] : []),
		redirectMappings,
	})
	// nor does it record the file it was placed from any more; its functions keep the files they record
	const root = cloneMappings.find((mapping) => mapping.source.id === applicationRef.id)?.target
	if (root && templateLink === 'break') await removeOwnProvenance(tx, { element: root })

	await postExtractionCleanup(tx)
}
