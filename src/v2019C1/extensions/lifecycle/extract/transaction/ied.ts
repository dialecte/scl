import { readIedSourceFileType } from './read-ied-source-file-type'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { startFile } from '@/v2019C1/extensions/history/transaction/start-file'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { classifyIeds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { applySupervisionDependencies } from '@/v2019C1/extensions/lifecycle/layers/ied/apply-supervision-dependencies'
import { readIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-communication'
import { readSupervisionDependencies } from '@/v2019C1/extensions/lifecycle/layers/ied/read-supervision-dependencies'
import { selectIedContent } from '@/v2019C1/extensions/lifecycle/layers/ied/select-ied-content'
import { readLinkedSections } from '@/v2019C1/extensions/lifecycle/linked-sections/read'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction/write-provenance'

import type { ExtractWarning } from './extract.types'
import type { IedExtractParams } from './ied.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Copy a selected IED instance and its scoped Communication into an empty target (in progress).
 * Currently requires explicit `kind: 'instance'` and `inputs: 'none'`. Copies the surviving logical-node type
 * closure and preserves instance identity, labels and vendor content. Supervision nodes and foreign receiver,
 * client, association and KDC entries are left out with source-record warnings.
 * Removes FCDA depending on omitted supervision, dropping DataSets with no surviving native FCDA. Retained affected
 * Report/GSE/SV controls increment confRev by 10000 once; affected LogControls are disabled. Removed DataSets are
 * unlinked without replacing controls. Missing/invalid or overflowing counters refuse before output writes.
 * Replaces the target ISD Header/history with a fresh identity and one initial item, retaining prior history only
 * as labelled inner text. Assigns the issuer and records the source at the Header and IED.
 * Source type follows the registered extension: .ssd is SSD; .scd, .xml or no extension is SCD, regardless of Header
 * fileType. Other extensions are refused with OPTION_NOT_AVAILABLE before writes.
 * Refuses an implemented selected IED, a target already holding an IED and an unavailable revision start.
 * Process extraction, input conversion and other export modes are not implemented yet.
 *
 * @intent extract an IED into an ISD instance, copy an IED with its reachable data types
 */
export async function ied(
	tx: Core.Transaction<Config>,
	params: IedExtractParams,
): Promise<{ warnings: ExtractWarning[] }> {
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
	const targetIeds = await tx.getRecordsByTagName('IED')
	if (targetIeds.length > 0) {
		throwDialecteError(SCL_ERRORS.EXTRACTION_TARGET_NOT_EMPTY, {
			detail: 'extract.ied: target already holds an IED',
		})
	}
	const sourceFileType = await readIedSourceFileType(sourceQuery)
	const selection = await selectIedContent(sourceQuery, { iedRef, iedName })
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
	const targetParent = await tx.getRoot()
	await startFile(tx, {
		as: params.as ?? 'new',
		filename: `ISD_${iedName}`,
		header: {
			fileType: 'ISD',
			tool: params.tool,
			...(params.nameStructure ? { nameStructure: params.nameStructure } : {}),
		},
		item: {
			who: params.who,
			what: 'ISD initialization',
			why: 'IED specification was extracted from a previous file',
		},
	})
	const cloned = await deep(tx, {
		sourceQuery,
		ref: iedRef,
		targetParent,
		leaveOut: selection.leaveOut,
		withTypes: { keepNameFrom: 'source' },
		omit: ['MinRequestedSCDFiles'],
	})
	const cloneMappings = [...cloned.cloneMappings]
	for (const ref of linked.satelliteRefs) {
		const communication = await deep(tx, {
			sourceQuery,
			ref,
			targetParent,
			withTypes: false,
			leaveOut: description.leaveOut,
		})
		cloneMappings.push(...communication.cloneMappings)
	}
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'keep' })
	const clonedIed = { tagName: 'IED', id: cloned.record.id } as const
	await tx.update(clonedIed, { attributes: { manufacturer: params.issuer } })
	await writeProvenance(tx, {
		sourceQuery,
		target: { anchor: 'document', fileType: sourceFileType },
	})
	await writeProvenance(tx, {
		sourceQuery,
		target: { anchor: 'ied', root: clonedIed, fileType: sourceFileType },
	})
	await applySupervisionDependencies(tx, { plan: supervisionDependencies, cloneMappings })
	// Clone/update hooks may stamp the current file while content is written; an extracted specification records none.
	const minimumScdFiles = await tx.getChildren(clonedIed, 'MinRequestedSCDFiles')
	for (const wrapper of minimumScdFiles) await tx.delete(wrapper)
	return { warnings: selection.warnings }
}
