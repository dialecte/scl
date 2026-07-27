import type { ProvenanceFileType, WriteProvenanceParams } from './write-provenance.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** SclRef wrapper element per template kind. */
const SCL_REF_TAG: Record<ProvenanceFileType, 'FunctionSclRef' | 'ApplicationSclRef'> = {
	FSD: 'FunctionSclRef',
	ASD: 'ApplicationSclRef',
}

/**
 * Writes the instantiation provenance link on the cloned root: a fresh
 * `FunctionSclRef` / `ApplicationSclRef` > `SclFileReference` pointing back at the
 * template file the instance was created from.
 *
 * The kernel self-sources every field from the source document — `fileType` from
 * the caller, `version` / `revision` / `fileUuid` from the template `Header`,
 * `fileName` from the source store — so no SET dependency. `version` / `revision`
 * fall back to empty strings when the (optional) Header attributes are absent.
 *
 * Always **creates** a new ref (never reuses an existing one): a root may already
 * carry composition-provenance SclRefs, and each instantiation is a distinct link.
 */
export async function writeProvenance(
	tx: Core.Transaction<Config>,
	params: WriteProvenanceParams,
): Promise<void> {
	const { sourceQuery, targetRoot, fileType } = params

	const [header] = await sourceQuery.getRecordsByTagName('Header')
	const headerAttributes = header ? await sourceQuery.getAttributes(header) : undefined

	const sclRef = await tx.addChild(targetRoot, { tagName: SCL_REF_TAG[fileType] })

	const { name } = await sourceQuery.getDocumentInfo()
	await tx.addChild(sclRef, {
		tagName: 'SclFileReference',
		attributes: {
			fileType,
			version: headerAttributes?.version ?? '',
			revision: headerAttributes?.revision ?? '',
			fileName: name,
			fileUuid: headerAttributes?.uuid ?? '',
		},
	})
}
