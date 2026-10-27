import { ensureSubstationTemplateStructure } from './ensure-substation-structure'
import { omitOfSections } from './function-sections'
import { readInstanceContent } from './instance-content'
import { postExtractionCleanup } from './post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance/composed-functions'
import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'
import { removeOwnProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { AsdExtractOptions } from './extract.types'
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
	} & AsdExtractOptions,
): Promise<void> {
	const { sourceQuery, applicationRef, tool, who, nameStructure, sections } = params
	const { as = 'new', templateLink = 'keep' } = params

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
		omit: omitOfSections({ sections }),
	})

	// the application extracted keeps its template link unless the consumer breaks it: then the application and what
	// came with its instance lose it — what it holds, the functions it composes that record no file of their own; a
	// function placed from its FSD keeps its link; the cloned uuid refs are repointed across ALL clones, before cleanup
	// reads them to detect orphans
	const unlinked =
		templateLink === 'break'
			? await readApplicationInstanceContent(sourceQuery, { applicationRef })
			: new Set<string>()
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'strip', unlinked, redirectMappings })
	// nor does it record the file it was placed from any more; its functions keep the files they record
	const root = cloneMappings.find((mapping) => mapping.source.id === applicationRef.id)?.target
	if (root && templateLink === 'break') await removeOwnProvenance(tx, { element: root })

	await postExtractionCleanup(tx)
}

/** What came with an application's instance: the application and what it holds, the functions it composes. */
async function readApplicationInstanceContent(
	sourceQuery: Core.Query<Config>,
	params: { applicationRef: Scl.Ref<'Application'> },
): Promise<Set<string>> {
	const { applicationRef } = params
	const companions = await findComposedFunctionRefs(sourceQuery, applicationRef)
	return readInstanceContent(sourceQuery, { roots: [applicationRef], companions })
}
