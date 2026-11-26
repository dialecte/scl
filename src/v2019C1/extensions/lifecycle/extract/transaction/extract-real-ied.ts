import {
	CID_PROCESS_OPTIONS,
	CLIENT_REFS,
	EXPORTED_ROOT_TAGS,
	INTERACTING_IEDS,
	NO_SENDERS,
	REAL_IED_EXPORT_FILES,
} from './ied.constants'
import { readIedSourceFileType } from './read-ied-source-file-type'
import { refuseTargetNotEmpty } from './refuse-ied-export'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { startFile } from '@/v2019C1/extensions/history/transaction/start-file'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { withProgressPhases } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases'
import { IED_EXTRACT_PROGRESS_PHASES } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.constants'
import { readIedExportRefusals } from '@/v2019C1/extensions/lifecycle/extract/query/read-ied-export-refusals'
import { readSelectedIedName } from '@/v2019C1/extensions/lifecycle/extract/query/read-selected-ied-name'
import { applyRecordEdits } from '@/v2019C1/extensions/lifecycle/layers/ied/apply-record-edits'
import { cloneIedProcess } from '@/v2019C1/extensions/lifecycle/layers/ied/clone-ied-process'
import { planIedProcess } from '@/v2019C1/extensions/lifecycle/layers/ied/plan-ied-process'
import { readIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-communication'
import { readIedProcessSource } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-process-source'
import { selectRealIedContent } from '@/v2019C1/extensions/lifecycle/layers/ied/select-real-ied-content'
import {
	planClosure,
	planSenderSeeds,
	readClosureModel,
} from '@/v2019C1/extensions/lifecycle/layers/reference-closure/closure'
import { readLinkedSections } from '@/v2019C1/extensions/lifecycle/linked-sections/read'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'
import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction/write-provenance'

import type { ExtractWarning } from './extract.types'
import type {
	CidExtractParams,
	CidSender,
	CidSenders,
	IedExtractResult,
	RealIedExport,
} from './ied.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	EnterPhase,
	IedExtractProgressPhaseKey,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.types'
import type { IedProcessPlan } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
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
	return await withProgressPhases(tx, {
		phases: IED_EXTRACT_PROGRESS_PHASES,
		run: async function extractInPhases(enter) {
			return await extractRealIedInPhases(tx, { params, enter })
		},
	})
}

/** The same steps, each entering its progress phase as it starts. */
async function extractRealIedInPhases(
	tx: Core.Transaction<Config>,
	context: { params: CidExtractParams; enter: EnterPhase<IedExtractProgressPhaseKey> },
): Promise<IedExtractResult> {
	const { params, enter } = context
	enter('check')
	const iedName = await refuseRealIedExport(tx, params)
	enter('read')
	const read = await readRealIedExport(tx, { params, iedName })
	enter('write')
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
	if (params.includeSubstation !== undefined && typeof params.includeSubstation !== 'boolean') {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'includeSubstation', value: String(params.includeSubstation) },
			detail: 'extract.ied: includeSubstation is true or false',
		})
	}
	const iedName = await readSelectedIedName(sourceQuery, { iedRef })
	const refusal = (
		await readIedExportRefusals(sourceQuery, { iedRef, iedName, fileTypes: ['CID'] })
	).CID
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
	const senders =
		params.params.interactingIeds === 'publishers'
			? await readSenders(sourceQuery, { iedRef })
			: NO_SENDERS
	const selection = await selectRealIedContent(sourceQuery, {
		iedRef,
		destinationQuery: tx,
		clientRefs: params.params.clientRefs ?? 'keep',
		senders: senders.roots,
	})
	const description = await readIedCommunication(sourceQuery, { iedRef, iedName })
	const communicationLeaveOut = withSenderConnections({
		leaveOut: description.leaveOut,
		connections: senders.connections,
	})
	const processSource = params.params.includeSubstation
		? await readIedProcessSource(sourceQuery, { iedRef })
		: undefined
	const process = processSource
		? planIedProcess({
				source: processSource,
				iedRef,
				iedLeaveOut: selection.leaveOut,
				options: CID_PROCESS_OPTIONS,
			})
		: undefined
	const linked = await readLinkedSections(tx, {
		sourceQuery,
		description,
		removalBase: { kind: 'none' },
		// a file of its own holds nothing a shared element could be mapped onto
		landings: [],
	})
	const minimumScdFiles = await readMinimumScdFiles(sourceQuery, { iedRef })
	return {
		sourceFileType,
		selection: {
			...selection,
			warnings: [
				...selection.warnings,
				...senders.unresolvedMembers.map((id): ExtractWarning => ({
					code: 'data-set-member-unresolved',
					source: { tagName: 'FCDA', id },
				})),
				...(process?.warnings ?? []),
			],
		},
		description,
		linked,
		minimumScdFiles,
		senders: senders.senders,
		communicationLeaveOut,
		process,
	}
}

/**
 * The IEDs sending to the IED: the control blocks and logical nodes its inputs name in other IEDs, closed over what they
 * reference (`planClosure`): each sending IED cut to that, its connections cut to their address and the GSE / SMV of what it
 * sends; the members of a sent data set naming nothing the sender holds.
 */
async function readSenders(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'> },
): Promise<CidSenders> {
	const { iedRef } = params
	const model = await readClosureModel(query, { iedRefs: [iedRef] })
	const { ExtRef: found = [] } = await query.findDescendants(iedRef, { collect: ['ExtRef'] })
	const inputs = found.filter(isNativeRecord)
	const seeds = planSenderSeeds({ model, iedRef, inputs })
	const plan = planClosure({ model, seeds: [{ ref: iedRef, depth: 'whole' }, ...seeds] })
	const interfaceIeds = [...plan.ieds].filter(([, closure]) => closure.depth === 'interface')
	const subNetworkOf = new Map(
		model.ConnectedAP.map((connection) => [connection.id, connection.parent?.id]),
	)
	return {
		roots: interfaceIeds.map(([id, closure]) => ({
			ref: { tagName: 'IED', id },
			depth: 'interface',
			uuids: closure.keep?.uuids ?? new Set<string>(),
			controlBlocks: closure.keep?.controlBlocks ?? new Set<string>(),
		})),
		senders: interfaceIeds.map(([id, closure]) => ({
			ied: { tagName: 'IED', id },
			leaveOut: closure.leaveOut,
			engRight: closure.engRight,
		})),
		connections: new Map(
			[...plan.connections].map(([id, connection]) => [
				id,
				{ subNetwork: subNetworkOf.get(id), leaveOut: connection.leaveOut },
			]),
		),
		unresolvedMembers: [...plan.unresolvedMembers],
	}
}

/** What the Communication leaves out once the senders' connections are written: each with its subnetwork, cut inside. */
function withSenderConnections(params: {
	leaveOut: ReadonlySet<string>
	connections: CidSenders['connections']
}): ReadonlySet<string> {
	const { leaveOut, connections } = params
	const written = new Set(
		[...connections].flatMap(([id, connection]) => [
			id,
			...(connection.subNetwork ? [connection.subNetwork] : []),
		]),
	)
	return new Set([
		...[...leaveOut].filter((id) => !written.has(id)),
		...[...connections.values()].flatMap((connection) => [...connection.leaveOut]),
	])
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
			leaveOut: read.communicationLeaveOut,
		})
		cloneMappings.push(...communication.cloneMappings)
	}
	const senderMappings = await writeSenders(tx, {
		sourceQuery,
		targetParent,
		senders: read.senders,
	})
	await finalizeClonedIdentity(tx, {
		cloneMappings: [...cloneMappings, ...senderMappings],
		mode: 'keep',
	})
	// the substation part comes once the IED holds its own uuids: what it maps to is then there to keep
	if (read.process) await writeProcessPart(tx, { sourceQuery, process: read.process })
	const clonedIed = { tagName: 'IED', id: cloned.record.id } as const
	await rewriteMinimumScdFiles(tx, { sourceQuery, ied: clonedIed, sources: read.minimumScdFiles })
	await writeProvenance(tx, {
		sourceQuery: provenanceQuery,
		target: { anchor: 'document', fileType: read.sourceFileType },
	})
}

/** The substation part related to the IED: its frames cloned with the project's identifiers, its cut references applied. */
async function writeProcessPart(
	tx: Core.Transaction<Config>,
	params: { sourceQuery: Core.Query<Config>; process: IedProcessPlan },
): Promise<void> {
	const { sourceQuery, process } = params
	const processMappings = await cloneIedProcess(tx, { sourceQuery, plan: process })
	await finalizeClonedIdentity(tx, { cloneMappings: processMappings, mode: 'keep' })
	await applyRecordEdits(tx, { edits: process.edits, cloneMappings: processMappings })
}

/** Each sending IED, cut to what it sends, with the types its logical nodes use, marked not engineered in the file. */
async function writeSenders(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		targetParent: Parameters<typeof deep>[1]['targetParent']
		senders: readonly CidSender[]
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, targetParent, senders } = params
	const mappings: Scl.CloneMapping[] = []
	for (const sender of senders) {
		const cloned = await deep(tx, {
			sourceQuery,
			ref: sender.ied,
			targetParent,
			leaveOut: sender.leaveOut,
			withTypes: { keepNameFrom: 'source' },
		})
		await tx.update(
			{ tagName: 'IED', id: cloned.record.id },
			{ attributes: { engRight: sender.engRight } },
		)
		mappings.push(...cloned.cloneMappings)
	}
	return mappings
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
