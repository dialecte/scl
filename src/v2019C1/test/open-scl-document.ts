import { assertCoherentSclReferences } from './assert-coherent-scl-references'
import { assertValidSclXml } from './assert-valid-scl-xml'

import type { OpenSclDocumentParams } from './open-scl-document.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Import one more document into a test project — a previous revision of a file, a third file the act reads — and open
 * it. Its XML is checked as a fixture is (by structure, then for coherent references), and its records keep the ids
 * the XML names, like the source and the target. The project owns it: it goes when the project goes.
 *
 * @intent open a third document in a test project, import a previous revision in a test, test an act that reads several SCL files
 */
export async function openSclDocument(params: OpenSclDocumentParams): Promise<Scl.Document> {
	const { project, xml, label, allowIncoherentReferences } = params
	assertValidSclXml(xml, label, { requireComplete: false })
	if (!allowIncoherentReferences) assertCoherentSclReferences({ xml, label })

	const [entry] = await project.import([new File([xml], `${label}.xml`, { type: 'text/xml' })], {
		useCustomRecordsIds: true,
	})
	if (entry.status === 'failed') throw entry.error
	return project.openDocument(entry.documentId)
}
