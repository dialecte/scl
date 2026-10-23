import { ROOT_ANCHORS } from './write-provenance.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { findOwnProvenance } from '@/v2019C1/extensions/reference/query/provenance/find-own-provenance'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	ProvenanceTarget,
	SclFileReferenceValues,
	SclFileType,
	WriteProvenanceParams,
} from './write-provenance.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Records the source file an element or the document was made from: an `SclFileReference` sourced from the source
 * `Header` (`version` / `revision` / `fileUuid`) and store (`fileName`). The same writer serves a placement and an
 * update, so a reference always names the file version the element was last made from.
 *
 * The anchor is chosen by `target`:
 * - `function` / `application` — the root's own `FunctionSclRef` / `ApplicationSclRef` naming the source file (the
 *   same `fileUuid`, or the same `fileName` when the source names no uuid) is rewritten to the source's version and
 *   revision — the root records one reference per file; with none, one is added. The references it records of other
 *   files (the file its template was made from) are left.
 * - `document` — appended to the target `Header > SourceFiles` (SSD / SCD), unless the Header already lists that file
 *   version: the files newly imported are appended, in the order they were.
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
			throwDialecteError(SCL_ERRORS.TARGET_HEADER_MISSING, {
				detail: 'writeProvenance: document anchor requires a target Header',
			})
		}
		const sourceFiles = await tx.ensureChild(header, { tagName: 'SourceFiles' })
		const listed = await tx.getChildren(sourceFiles, 'SclFileReference')
		if (listed.some((reference) => namesSameVersion({ reference, attributes }))) return
		await tx.addChild(sourceFiles, { tagName: 'SclFileReference', attributes })
		return
	}

	const { tag } = ROOT_ANCHORS[target.anchor]
	const own = await findOwnProvenance(tx, { element: target.root })
	const [recorded, ...duplicates] = own.filter(
		({ wrapper, reference }) => wrapper.tagName === tag && namesSameFile({ reference, attributes }),
	)
	if (!recorded) {
		const sclRef = await tx.addChild(target.root, { tagName: tag })
		await tx.addChild(sclRef, { tagName: 'SclFileReference', attributes })
		return
	}
	if (!namesSameVersion({ reference: recorded.reference, attributes })) {
		// a source the store gives no name keeps the name the reference holds
		const fileName =
			attributes.fileName || heldValue({ reference: recorded.reference, name: 'fileName' }) || ''
		await tx.any.update(recorded.reference, { attributes: { ...attributes, fileName } })
	}
	for (const { wrapper } of duplicates) await tx.any.delete(wrapper)
}

/** Source the shared `SclFileReference` payload from the source document (single source of truth). */
async function buildSclFileReferenceAttributes(
	sourceQuery: Core.Query<Config>,
	fileType: SclFileType,
): Promise<SclFileReferenceValues> {
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

/** Whether a reference names the source file: by its uuid, or by its name when the source names no uuid. */
function namesSameFile(params: {
	reference: AnyRawRecord | AnyTrackedRecord | AnyTreeRecord
	attributes: SclFileReferenceValues
}): boolean {
	const { reference, attributes } = params
	if (heldValue({ reference, name: 'fileType' }) !== attributes.fileType) return false
	return attributes.fileUuid
		? heldValue({ reference, name: 'fileUuid' }) === attributes.fileUuid
		: !heldValue({ reference, name: 'fileUuid' }) &&
				heldValue({ reference, name: 'fileName' }) === attributes.fileName
}

/**
 * Whether a reference names the same version of the same file as the source: the same file (see
 * {@link namesSameFile}), the same `version` and `revision`. The name a store gives the file is not part of it.
 */
function namesSameVersion(params: {
	reference: AnyRawRecord | AnyTrackedRecord | AnyTreeRecord
	attributes: SclFileReferenceValues
}): boolean {
	const { reference, attributes } = params
	return (
		namesSameFile({ reference, attributes }) &&
		(heldValue({ reference, name: 'version' }) ?? '') === attributes.version &&
		(heldValue({ reference, name: 'revision' }) ?? '') === attributes.revision
	)
}

/** The value a reference holds, absent → `undefined`. */
function heldValue(params: {
	reference: AnyRawRecord | AnyTrackedRecord | AnyTreeRecord
	name: string
}): string | undefined {
	const { reference, name } = params
	return readAttribute({ record: reference, name, defaults: 'none', fullObject: true })?.value
}

function fileTypeOf(target: ProvenanceTarget): SclFileType {
	return target.anchor === 'document' ? target.fileType : ROOT_ANCHORS[target.anchor].fileType
}
