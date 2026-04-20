import { ensureSubstationTemplateStructure } from '../../transaction/ensure-substation-structure'
import { cloneApplicationContent } from '../shared/clone-application'
import { postExtractionCleanup } from '../shared/post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'

import type { Scl } from '@/v2019C1/config'

export async function extractToAsd(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
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

	await cloneApplicationContent(tx, { sourceQuery, applicationRef, structure })

	await postExtractionCleanup(tx)
}
