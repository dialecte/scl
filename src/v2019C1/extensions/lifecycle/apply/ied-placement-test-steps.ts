import { readAttribute } from '@/v2019C1/helpers'

import type { ImportSourceParams, OnlyIedParams } from './ied-placement-test-steps.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The steps the IED placement tests share: the source file imported, its IED, the project root it lands under. */

/** A source file imported into the test project, by name, as a read query. */
export async function importSource(params: ImportSourceParams): Promise<Core.Query<Config>> {
	const { project, xml, fileName } = params
	const imported = await project.importFile(new File([xml], fileName, { type: 'text/xml' }))
	return project.openDocument(imported.documentId).query
}

/** The first IED of a source file. */
export async function onlyIed(params: OnlyIedParams): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.sourceQuery.getRecordsByTagName('IED')
	if (!ied || !readAttribute({ record: ied, name: 'name' }))
		throw new Error('the source holds no IED')
	return { tagName: 'IED', id: ied.id }
}

/** The root of the project the IED is placed under. */
export async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
