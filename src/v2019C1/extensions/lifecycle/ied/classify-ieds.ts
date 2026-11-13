import { REAL_DEVICE_FILE_EXTENSION, REAL_DEVICE_FILE_TYPES } from './classify-ieds.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type {
	IedClassification,
	IedClassificationBasis,
	IedKind,
	IedKindEntry,
} from './classify-ieds.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Classify every IED, in document order, as a real device's IED (`implemented`) or one written to
 * specify a device (`specification`). An IED is implemented when an ICD or IID file is among its
 * own source files (`IEDSourceFiles` directly under the IED; a reference in the document header or
 * in a list wrapped in a `Private` does not count), or when the document itself is an ICD file; any
 * other IED is a specification IED. The IEDs and the source file references are read by tag,
 * whatever the number of IEDs; nothing below the IEDs is walked.
 *
 * @intent which IEDs are real devices and which are specification IEDs, is an IED implemented (ICD/IID source), S-IED or real IED instead of reading manufacturer
 */
export async function classifyIeds(query: Core.Query<Config>): Promise<IedClassification[]> {
	const inIcdFile = await isIcdDocument(query)
	const kinds = await readKinds(query, { inIcdFile })
	const root = await query.getRoot()
	const positionById = new Map(root.children.map((child, position) => [child.id, position]))
	const inDocumentOrder = [...kinds].sort(
		(entry, other) =>
			(positionById.get(entry.ied.id) ?? Infinity) - (positionById.get(other.ied.id) ?? Infinity),
	)
	return inDocumentOrder.map((entry) => ({
		...entry,
		basis: basisOf({ kind: entry.kind, inIcdFile }),
	}))
}

/**
 * The kind of every IED of the document, by the rule of `classifyIeds`, in no particular order: the
 * IEDs and the source file references read by tag, the source file lists holding them read in one
 * batch, whatever the number of IEDs.
 *
 * @internal
 */
export async function readIedKinds(query: Core.Query<Config>): Promise<IedKindEntry[]> {
	const inIcdFile = await isIcdDocument(query)
	return readKinds(query, { inIcdFile })
}

/** `readIedKinds` once the document's file type is known. */
async function readKinds(
	query: Core.Query<Config>,
	params: { inIcdFile: boolean },
): Promise<IedKindEntry[]> {
	const { inIcdFile } = params
	const fileTypesByIed = inIcdFile
		? new Map<string, string[]>()
		: await readSourceFileTypesByIed(query)
	const ieds = await query.getRecordsByTagName('IED')
	return ieds.map((ied) => ({
		ied: { tagName: 'IED', id: ied.id },
		name: readAttribute({ record: ied, name: 'name', defaults: 'none' }) ?? '',
		kind: classifyOne({ inIcdFile, fileTypes: fileTypesByIed.get(ied.id) ?? [] }),
	}))
}

/**
 * The kind of one IED, by the rule of `classifyIeds`, read from that IED alone: its own source file
 * lists and their references, and the document's file type. `undefined` when the document does not
 * hold the IED.
 *
 * @internal
 */
export async function classifyIed(
	query: Core.Query<Config>,
	params: { ied: Scl.Ref<'IED'> },
): Promise<IedKind | undefined> {
	// read first: an absent IED has no kind, where its children would read as none (a specification
	// IED); getChildren reads the record it is given again, one read more than needed until reads are cached
	const ied = await query.getRecord(params.ied)
	if (!ied) return undefined
	const inIcdFile = await isIcdDocument(query)
	if (inIcdFile) return classifyOne({ inIcdFile, fileTypes: [] })

	// getChildren looks through a transparent Private: only the lists and references directly under
	// their parent count, as for the read by tag
	const lists = await query.getChildren(ied, 'IEDSourceFiles')
	const ownLists = lists.filter((list) => list.parent?.id === ied.id)
	const fileTypes: string[] = []
	for (const list of ownLists) {
		const references = await query.getChildren(list, 'SclFileReference')
		const ownReferences = references.filter((reference) => reference.parent?.id === list.id)
		fileTypes.push(...ownReferences.flatMap((reference) => fileTypeOf({ reference })))
	}
	return classifyOne({ inIcdFile, fileTypes })
}

/**
 * The rule: an IED is implemented in an ICD document, or when an ICD or IID file is among its own
 * source file types; any other IED is a specification IED.
 */
function classifyOne(params: { inIcdFile: boolean; fileTypes: readonly string[] }): IedKind {
	const { inIcdFile, fileTypes } = params
	if (inIcdFile) return 'implemented'
	const describesRealDevice = fileTypes.some((fileType) => REAL_DEVICE_FILE_TYPES.has(fileType))
	return describesRealDevice ? 'implemented' : 'specification'
}

/** What decided a kind: the document being an ICD file, a real device's source file, or none. */
function basisOf(params: { kind: IedKind; inIcdFile: boolean }): IedClassificationBasis {
	if (params.kind === 'specification') return 'no-provenance'
	return params.inIcdFile ? 'icd-file' : 'provenance'
}

async function isIcdDocument(query: Core.Query<Config>): Promise<boolean> {
	const { extension } = await query.getDocumentInfo()
	return extension.toLowerCase() === REAL_DEVICE_FILE_EXTENSION
}

/**
 * The file types of each IED's own source files, by IED id: the references read by tag, the lists
 * holding them (`IEDSourceFiles`, not the header's `SourceFiles`) in one batch, the IED their parent.
 */
async function readSourceFileTypesByIed(query: Core.Query<Config>): Promise<Map<string, string[]>> {
	const references = await query.getRecordsByTagName('SclFileReference')
	const inIedLists = references.flatMap((reference) =>
		reference.parent?.tagName === 'IEDSourceFiles'
			? [{ reference, listId: reference.parent.id }]
			: [],
	)
	const listIds = [...new Set(inIedLists.map(({ listId }) => listId))]
	if (listIds.length === 0) return new Map()

	const lists = await query.getRecords(
		listIds.map((id) => ({ tagName: 'IEDSourceFiles' as const, id })),
	)
	const iedIdByList = new Map(
		lists.flatMap((list) =>
			list?.parent?.tagName === 'IED' ? [[list.id, list.parent.id] as const] : [],
		),
	)
	const fileTypesByIed = new Map<string, string[]>()
	for (const { reference, listId } of inIedLists) {
		const iedId = iedIdByList.get(listId)
		if (iedId === undefined) continue
		const fileTypes = fileTypesByIed.get(iedId) ?? []
		fileTypes.push(...fileTypeOf({ reference }))
		fileTypesByIed.set(iedId, fileTypes)
	}
	return fileTypesByIed
}

/** A source file reference's file type, none when it carries none. */
function fileTypeOf(params: { reference: Core.AnyRawRecord }): string[] {
	const fileType = readAttribute({ record: params.reference, name: 'fileType', defaults: 'none' })
	return fileType ? [fileType] : []
}
