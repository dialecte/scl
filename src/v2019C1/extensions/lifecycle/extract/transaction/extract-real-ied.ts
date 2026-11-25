import {
	CLIENT_REFS,
	EXPORTED_ROOT_TAGS,
	INTERACTING_IEDS,
	REAL_IED_EXPORT_FILES,
} from './ied.constants'
import { readIedSourceFileType } from './read-ied-source-file-type'
import { readSelectedIedName, refuseTargetNotEmpty } from './refuse-ied-export'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { startFile } from '@/v2019C1/extensions/history/transaction/start-file'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { readIedExportRefusals } from '@/v2019C1/extensions/lifecycle/extract/query/read-ied-export-refusals'
import { applyRecordEdits } from '@/v2019C1/extensions/lifecycle/layers/ied/apply-record-edits'
import { readIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-communication'
import { selectRealIedContent } from '@/v2019C1/extensions/lifecycle/layers/ied/select-real-ied-content'
import { readLinkedSections } from '@/v2019C1/extensions/lifecycle/linked-sections/read'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction/write-provenance'

import type { CidExtractParams, IedExtractResult, RealIedExport } from './ied.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Export one real IED into a CID: the IED as the project holds it (its identifiers, values, control blocks, data sets and
 * the lists of files it came from), its own connections with their addresses, and the data types its logical nodes use;
 * the project recorded at the Header. What the content selection reduces is listed in the warnings. Refused before any
 * write: options not offered, a specification IED, an IED with no network address, a target already holding an IED or a
 * process part, and a revision start.
 */
export async function extractRealIed(
	tx: Core.Transaction<Config>,
	params: CidExtractParams,
): Promise<IedExtractResult> {
	const iedName = await refuseRealIedExport(tx, params)
	const read = await readRealIedExport(tx, { params, iedName })
	await writeRealIedExport(tx, { params, iedName, read })
	return {
		warnings: read.selection.warnings,
		fileName: `${iedName}${REAL_IED_EXPORT_FILES.CID.extension}`,
	}
}

/** Refuse before any write what the export does not write; the name of the selected IED otherwise. */
async function refuseRealIedExport(
	tx: Core.Transaction<Config>,
	params: CidExtractParams,
): Promise<string> {
	const { sourceQuery, iedRef } = params
	refuseOptionNotOffered({
		option: 'interactingIeds',
		value: params.interactingIeds,
		offered: INTERACTING_IEDS,
	})
	if (params.clientRefs !== undefined) {
		refuseOptionNotOffered({ option: 'clientRefs', value: params.clientRefs, offered: CLIENT_REFS })
	}
	if (params.interactingIeds === 'publishers') {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'interactingIeds', value: params.interactingIeds },
			detail: 'extract.ied: a CID with the IEDs sending to the selected IED is not available yet',
		})
	}
	const iedName = await readSelectedIedName(sourceQuery, { iedRef })
	const refusal = (await readIedExportRefusals(sourceQuery, { iedRef, iedName })).CID
	if (refusal) {
		throwDialecteError(SCL_ERRORS[refusal.key], {
			ref: iedRef,
			meta: refusal.meta,
			detail: `extract.ied: no CID is written for this IED (${refusal.key})`,
		})
	}
	await refuseTargetNotEmpty(tx)
	return iedName
}

/** An option whose value is not one of those offered: refused, with the option and the value given. */
function refuseOptionNotOffered(params: {
	option: string
	value: unknown
	offered: readonly string[]
}): void {
	const { option, value, offered } = params
	if (typeof value === 'string' && offered.includes(value)) return
	throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
		meta: { option, value: String(value) },
		detail: `extract.ied: ${option} must be one of ${offered.join(', ')}`,
	})
}

/** Everything the export writes, read and decided before the first write. */
async function readRealIedExport(
	tx: Core.Transaction<Config>,
	params: { params: CidExtractParams; iedName: string },
): Promise<RealIedExport> {
	const { iedName } = params
	const { sourceQuery, provenanceQuery = sourceQuery, iedRef } = params.params
	const sourceFileType = await readIedSourceFileType(provenanceQuery)
	const selection = await selectRealIedContent(sourceQuery, {
		iedRef,
		destinationQuery: tx,
		clientRefs: params.params.clientRefs ?? 'keep',
	})
	const description = await readIedCommunication(sourceQuery, { iedRef, iedName })
	const linked = await readLinkedSections(tx, {
		sourceQuery,
		description,
		removalBase: { kind: 'none' },
		// a file of its own holds nothing a shared element could be mapped onto
		landings: [],
	})
	const minimumScdFiles = await readMinimumScdFiles(sourceQuery, { iedRef })
	return { sourceFileType, selection, description, linked, minimumScdFiles }
}

/** The IED's own list of the minimum project files it needs, as the source holds it: written back exactly. */
async function readMinimumScdFiles(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'> },
): Promise<Scl.Ref<'MinRequestedSCDFiles'>[]> {
	const wrappers = await query.getChildren(params.iedRef, 'MinRequestedSCDFiles')
	return wrappers.map((wrapper) => ({ tagName: 'MinRequestedSCDFiles' as const, id: wrapper.id }))
}

/** Write the export: the file start, the IED and its types, its Communication, the identities and the provenance. */
async function writeRealIedExport(
	tx: Core.Transaction<Config>,
	params: { params: CidExtractParams; iedName: string; read: RealIedExport },
): Promise<void> {
	const { iedName, read } = params
	const { sourceQuery, provenanceQuery = sourceQuery, iedRef } = params.params
	const targetParent = await tx.getRoot()
	await startFile(tx, {
		as: params.params.as ?? 'new',
		filename: iedName,
		header: {
			fileType: 'CID',
			tool: params.params.tool,
			...(params.params.nameStructure ? { nameStructure: params.params.nameStructure } : {}),
		},
		item: {
			who: params.params.who,
			what: 'CID initialization',
			why: 'IED configuration was extracted from a project file',
		},
	})
	const cloned = await deep(tx, {
		sourceQuery,
		ref: iedRef,
		targetParent,
		leaveOut: read.selection.leaveOut,
		withTypes: { keepNameFrom: 'source' },
	})
	await applyRecordEdits(tx, { edits: read.selection.edits, cloneMappings: cloned.cloneMappings })
	const cloneMappings: Scl.CloneMapping[] = [...cloned.cloneMappings]
	for (const ref of read.linked.satelliteRefs) {
		const communication = await deep(tx, {
			sourceQuery,
			ref,
			targetParent,
			withTypes: false,
			leaveOut: read.description.leaveOut,
		})
		cloneMappings.push(...communication.cloneMappings)
	}
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'keep' })
	const clonedIed = { tagName: 'IED', id: cloned.record.id } as const
	await rewriteMinimumScdFiles(tx, { sourceQuery, ied: clonedIed, sources: read.minimumScdFiles })
	await writeProvenance(tx, {
		sourceQuery: provenanceQuery,
		target: { anchor: 'document', fileType: read.sourceFileType },
	})
}

/**
 * The IED's list of minimum project files exactly as the source holds it: written content may stamp the file being written
 * into it, so the cloned lists are replaced by fresh copies of the source's, last.
 */
async function rewriteMinimumScdFiles(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		ied: Scl.Ref<'IED'>
		sources: readonly Scl.Ref<'MinRequestedSCDFiles'>[]
	},
): Promise<void> {
	const { sourceQuery, ied, sources } = params
	const written = await tx.getChildren(ied, 'MinRequestedSCDFiles')
	for (const wrapper of written) await tx.delete(wrapper)
	for (const ref of sources)
		await deep(tx, { sourceQuery, ref, targetParent: ied, withTypes: false })
}
