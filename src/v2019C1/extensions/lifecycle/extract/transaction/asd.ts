import { ensureSubstationTemplateStructure } from './ensure-substation-structure'
import { postExtractionCleanup } from './post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'
import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'
import { ALWAYS_OMIT } from '@/v2019C1/extensions/lifecycle/layers/omit-filters'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'

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
	},
): Promise<void> {
	const { sourceQuery, applicationRef, tool, who, nameStructure } = params
	const structure = await ensureSubstationTemplateStructure(tx)

	const applicationName =
		(await tx.getAttribute(applicationRef, { name: 'name' })) || 'Unnamed Application'

	await history.transaction.addEntry(tx, {
		filename: `ASD_${applicationName.replace(/\s+/g, '_')}`,
		header: {
			fileType: 'ASD',
			version: 'keep',
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: 'ASD initialization',
			why: 'Application was extracted from a previous file',
		},
	})

	const mappings = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
		omit: ALWAYS_OMIT,
	})

	// Repoint cloned uuid refs across ALL clones of this operation, before cleanup
	// reads those refs to detect orphans.
	await applyUuidRemap(tx, { mappings })

	await postExtractionCleanup(tx)
}
