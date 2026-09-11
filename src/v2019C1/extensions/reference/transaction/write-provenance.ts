import type { ProvenanceTarget, SclFileType, WriteProvenanceParams } from './write-provenance.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Root-anchored kinds: the SclRef wrapper element + implied fileType. */
const ROOT_ANCHORS = {
	function: { tag: 'FunctionSclRef', fileType: 'FSD' },
	application: { tag: 'ApplicationSclRef', fileType: 'ASD' },
} as const

/**
 * Writes an instantiation/import provenance link: an `SclFileReference` pointing back at the source
 * file, sourced from the source `Header` (`version` / `revision` / `fileUuid`) and store (`fileName`).
 *
 * The anchor is chosen by `target`:
 * - `function` / `application` — a fresh `FunctionSclRef` / `ApplicationSclRef` on the cloned root
 *   (FSD / ASD). Always **creates** a new ref (a root may already carry composition SclRefs; each
 *   instantiation is a distinct link).
 * - `document` — appended to the target `Header > SourceFiles` (SSD / SCD): a whole-file source, with
 *   no per-root wrapper.
 *
 * `version` / `revision` fall back to empty strings when the (optional) Header attributes are absent.
 */
export async function writeProvenance(
	tx: Core.Transaction<Config>,
	params: WriteProvenanceParams,
): Promise<void> {
	const { sourceQuery, target } = params

	const attributes = await buildSclFileReferenceAttributes(sourceQuery, fileTypeOf(target))

	if (target.anchor === 'document') {
		const header = await tx.getRecord({ tagName: 'Header' })
		if (!header) {
			throw new Error('writeProvenance: document anchor requires a target Header')
		}
		const sourceFiles = await tx.ensureChild(header, { tagName: 'SourceFiles' })
		await tx.addChild(sourceFiles, { tagName: 'SclFileReference', attributes })
		return
	}

	const { tag } = ROOT_ANCHORS[target.anchor]
	const sclRef = await tx.addChild(target.root, { tagName: tag })
	await tx.addChild(sclRef, { tagName: 'SclFileReference', attributes })
}

/** Source the shared `SclFileReference` payload from the source document (single source of truth). */
async function buildSclFileReferenceAttributes(
	sourceQuery: Core.Query<Config>,
	fileType: SclFileType,
): Promise<Scl.AttributesValueObjectOf<'SclFileReference'>> {
	const [header] = await sourceQuery.getRecordsByTagName('Header')
	const headerAttributes = header ? await sourceQuery.getAttributes(header) : undefined

	const { name } = await sourceQuery.getDocumentInfo()

	return {
		fileType,
		version: headerAttributes?.version ?? '',
		revision: headerAttributes?.revision ?? '',
		fileName: name,
		fileUuid: headerAttributes?.uuid ?? '',
	}
}

function fileTypeOf(target: ProvenanceTarget): SclFileType {
	return target.anchor === 'document' ? target.fileType : ROOT_ANCHORS[target.anchor].fileType
}
