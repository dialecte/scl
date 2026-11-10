import { EXPORTED_ROOT_TAGS } from './ied.constants'
import { readIedSourceFileType } from './read-ied-source-file-type'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { startFile } from '@/v2019C1/extensions/history/transaction/start-file'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { classifyIeds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { applyIedProcessEdits } from '@/v2019C1/extensions/lifecycle/layers/ied/apply-ied-process-edits'
import { applySupervisionDependencies } from '@/v2019C1/extensions/lifecycle/layers/ied/apply-supervision-dependencies'
import { cloneIedProcess } from '@/v2019C1/extensions/lifecycle/layers/ied/clone-ied-process'
import { planIedProcess } from '@/v2019C1/extensions/lifecycle/layers/ied/plan-ied-process'
import { readIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-communication'
import { readIedProcessSource } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-process-source'
import { readSupervisionDependencies } from '@/v2019C1/extensions/lifecycle/layers/ied/read-supervision-dependencies'
import { removeLabels } from '@/v2019C1/extensions/lifecycle/layers/ied/remove-labels'
import { selectIedContent } from '@/v2019C1/extensions/lifecycle/layers/ied/select-ied-content'
import { readLinkedSections } from '@/v2019C1/extensions/lifecycle/linked-sections/read'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction/write-provenance'

import type { ExtractWarning } from './extract.types'
import type { IedExport, IedExtractParams } from './ied.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Copy a selected IED instance, the process part it implements and its scoped Communication into an empty target (in
 * progress). Currently requires explicit `kind: 'instance'` and `inputs: 'none'`. Copies the surviving logical-node type
 * closure and preserves instance identity and vendor content. Supervision nodes and foreign receiver, client,
 * association and KDC entries are left out with source-record warnings.
 * Removes FCDA depending on omitted supervision, dropping DataSets with no surviving native FCDA. Retained affected
 * Report/GSE/SV controls increment confRev by 10000 once; affected LogControls are disabled. Removed DataSets are
 * unlinked without replacing controls. Missing/invalid or overflowing counters refuse before output writes.
 * The process part holds the IED's LNodes in their substation, line or process frame, names and identifiers as in the
 * source: a function or subfunction holding none of them is left out, the levels and equipment above them stay, an
 * equipment of the frame keeps the connectivity node it connects to. A behaviour description goes only when all its
 * LNodes do, variables and process resources when they belong to the LNodes written; applications, allocation roles
 * and power system relations travel with what they name unless their option is `false`. A specification of an input
 * or output naming what the file does not hold stays with its expected data and without that link. Each LNode gets its
 * own naming as specified naming; data specifications lose their mapping. `labels: false` leaves no label in the file.
 * Replaces the target ISD Header/history with a fresh identity and one initial item, retaining prior history only
 * as labelled inner text. Assigns the issuer and records the source at the Header and IED.
 * Source type follows the registered extension: .ssd is SSD; .scd, .xml or no extension is SCD, regardless of Header
 * fileType. Other extensions are refused with OPTION_NOT_AVAILABLE before writes.
 * Refuses an implemented selected IED, a target already holding an IED or a process part (a substation, line or
 * process) and an unavailable revision start.
 * Input conversion and other export modes are not implemented yet.
 *
 * @intent extract an IED into an ISD instance, copy an IED with its reachable data types, export an ISD with its process part
 */
export async function ied(
	tx: Core.Transaction<Config>,
	params: IedExtractParams,
): Promise<{ warnings: ExtractWarning[] }> {
	const iedName = await refuseUnavailableExtraction(tx, params)
	const read = await readIedExport(tx, { ...params, iedName })
	await writeIedExport(tx, { params, iedName, read })
	return { warnings: [...read.selection.warnings, ...read.process.warnings] }
}

/** Refuse before any write what cannot be extracted yet; the name of the selected IED otherwise. */
async function refuseUnavailableExtraction(
	tx: Core.Transaction<Config>,
	params: IedExtractParams,
): Promise<string> {
	const { sourceQuery, iedRef } = params
	for (const option of ['kind', 'inputs'] as const) {
		const value = params[option]
		if (value === (option === 'kind' ? 'instance' : 'none')) continue
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option, value: String(value) },
			detail: `extract.ied: explicit instance extraction with no inputs is the only available mode`,
		})
	}
	const source = await sourceQuery.getRecord(iedRef)
	if (!source) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: iedRef,
			detail: 'extract.ied: selected source IED not found',
		})
	}
	const iedName = await sourceQuery.getAttribute(iedRef, { name: 'name' })
	if (!iedName) {
		throwDialecteError('ASSERTION_FAILED', {
			ref: iedRef,
			detail: 'extract.ied: selected source IED has no name',
		})
	}
	const classifications = await classifyIeds(sourceQuery)
	const selected = classifications.find((classification) => classification.ied.id === iedRef.id)
	if (selected?.kind === 'implemented') {
		throwDialecteError(SCL_ERRORS.IED_NOT_SPECIFICATION, {
			ref: iedRef,
			meta: { ied: iedRef },
			detail: 'extract.ied: selected source IED describes an implemented device',
		})
	}
	const targetRoot = await tx.getRoot()
	const held = targetRoot.children.find(function isWrittenByExport(child) {
		return EXPORTED_ROOT_TAGS.has(child.tagName)
	})
	if (held) {
		throwDialecteError(SCL_ERRORS.EXTRACTION_TARGET_NOT_EMPTY, {
			detail: `extract.ied: target already holds a ${held.tagName}`,
		})
	}
	return iedName
}

/** Everything the export writes, read and decided before the first write. */
async function readIedExport(
	tx: Core.Transaction<Config>,
	params: IedExtractParams & { iedName: string },
): Promise<IedExport> {
	const { sourceQuery, iedRef, iedName } = params
	const sourceFileType = await readIedSourceFileType(sourceQuery)
	const selection = await selectIedContent(sourceQuery, { iedRef, iedName })
	const processSource = await readIedProcessSource(sourceQuery, { iedRef })
	const process = planIedProcess({
		source: processSource,
		iedRef,
		iedLeaveOut: selection.leaveOut,
		options: params,
	})
	const supervisionDependencies = await readSupervisionDependencies(sourceQuery, {
		iedRef,
		leaveOut: selection.leaveOut,
	})
	const description = await readIedCommunication(sourceQuery, { iedRef, iedName })
	const linked = await readLinkedSections(tx, {
		sourceQuery,
		description,
		removalBase: { kind: 'none' },
	})
	return { sourceFileType, selection, process, supervisionDependencies, description, linked }
}

/** Write the export: the file start, the IED, its Communication and process part, then identities and provenance. */
async function writeIedExport(
	tx: Core.Transaction<Config>,
	params: { params: IedExtractParams; iedName: string; read: IedExport },
): Promise<void> {
	const { iedName, read } = params
	const { sourceQuery, iedRef } = params.params
	const targetParent = await tx.getRoot()
	await startFile(tx, {
		as: params.params.as ?? 'new',
		filename: `ISD_${iedName}`,
		header: {
			fileType: 'ISD',
			tool: params.params.tool,
			...(params.params.nameStructure ? { nameStructure: params.params.nameStructure } : {}),
		},
		item: {
			who: params.params.who,
			what: 'ISD initialization',
			why: 'IED specification was extracted from a previous file',
		},
	})
	const cloned = await deep(tx, {
		sourceQuery,
		ref: iedRef,
		targetParent,
		leaveOut: read.selection.leaveOut,
		withTypes: { keepNameFrom: 'source' },
		omit: ['MinRequestedSCDFiles'],
	})
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
	const processMappings = await cloneIedProcess(tx, { sourceQuery, plan: read.process })
	await finalizeClonedIdentity(tx, {
		cloneMappings: [...cloneMappings, ...processMappings],
		mode: 'keep',
	})
	await applyIedProcessEdits(tx, { plan: read.process, cloneMappings: processMappings })
	await finishIedExport(tx, { params: params.params, read, ied: cloned.record, cloneMappings })
}

/** The written IED's issuer and provenance, the supervision dependencies, then what no ISD holds. */
async function finishIedExport(
	tx: Core.Transaction<Config>,
	params: {
		params: IedExtractParams
		read: IedExport
		ied: Scl.RawRecord<Scl.ElementsOf>
		cloneMappings: readonly Scl.CloneMapping[]
	},
): Promise<void> {
	const { sourceQuery, issuer, labels } = params.params
	const { sourceFileType, supervisionDependencies } = params.read
	const clonedIed = { tagName: 'IED', id: params.ied.id } as const
	await tx.update(clonedIed, { attributes: { manufacturer: issuer } })
	await writeProvenance(tx, {
		sourceQuery,
		target: { anchor: 'document', fileType: sourceFileType },
	})
	await writeProvenance(tx, {
		sourceQuery,
		target: { anchor: 'ied', root: clonedIed, fileType: sourceFileType },
	})
	await applySupervisionDependencies(tx, {
		plan: supervisionDependencies,
		cloneMappings: [...params.cloneMappings],
	})
	// Clone/update hooks may stamp the current file while content is written; an extracted specification records none.
	const minimumScdFiles = await tx.getChildren(clonedIed, 'MinRequestedSCDFiles')
	for (const wrapper of minimumScdFiles) await tx.delete(wrapper)
	if (labels === false) await removeLabels(tx)
}
