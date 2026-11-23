import { buildIed } from './build-ied'
import { SHELL_OMITTED_TAGS, STAGE_FILE, STAGE_VERB } from './stage-isd.constants'

import { throwDialecteError } from '@dialecte/core'

import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import { SCL_ERRORS } from '@/v2019C1/errors'
import { releaseLNodeBindings } from '@/v2019C1/extensions/data-model/transaction/release-lnode-binding'
import { readProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section'
import { startFile } from '@/v2019C1/extensions/history/transaction/start-file'
import { readSatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { EXPORTED_ROOT_TAGS } from '@/v2019C1/extensions/lifecycle/extract/transaction/ied.constants'
import { classifyIeds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { cloneIedProcess } from '@/v2019C1/extensions/lifecycle/layers/ied/clone-ied-process'
import { TEMPLATE_ISD_IED_NAME } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-placement.constants'
import { indexProcessSection } from '@/v2019C1/extensions/lifecycle/layers/ied/index-process-section'
import { planProcessFrames } from '@/v2019C1/extensions/lifecycle/layers/ied/plan-process-frames'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'
import { readAttributes } from '@/v2019C1/helpers'

import type { StageIsdParams, StageIsdResult, StageRefusalReason } from './stage-isd.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { IedProcessPlan } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
import type * as Core from '@dialecte/core'

/**
 * Stage, in an empty document, the ISD of a specification built from logical nodes: the process frames of the LNodes
 * given, with the project's uuids and the LNodes' types; every LNode staged back to its specification (its binding
 * released) before any IED exists there; the shell IED copied without the files it came from, named `iedName`
 * (`iedUuid` stamped when given); then the IED built from the LNodes given (`buildIed`, name clashes and type
 * candidates judged on the project, each logical device name fitting both `iedName` and `SPECIFICATION`). No
 * Communication is written; the project and the shell are only read. Then `extract.ied` from the staging document,
 * with `provenanceQuery` the project, writes the ISD.
 *
 * Refuses with `SPECIFICATION_STAGE_REFUSED` before any write (`meta: { reason, stage: 'stageIsd', ref? }`): a staging
 * document already holding an IED or a process part (`target-not-empty`); no LNode (`no-lnodes`); an IED name the
 * schema refuses (`ied-name`); a shell IED of a real device (`shell-not-specification`); an LNode the project does not hold
 * or holds outside its substations, lines and processes (`lnode-outside-process`); checked in that order, the first
 * refusing. An LNode given twice is staged once. The build's own refusals pass through
 * (`SPECIFICATION_BUILD_REFUSED`).
 *
 * @intent stage an ISD built from logical nodes for a supplier, export an ISD of an allocation role, build an IED from logical nodes in a staging document
 *
 * @example
 * const staged = await scratch.transaction((tx) =>
 * 	tx.specification.stageIsd({ sourceQuery: project.query, lnodes, shell, iedName: 'P1' }),
 * )
 * await isd.transaction((tx) =>
 * 	tx.lifecycle.extract.ied({ sourceQuery: scratch.query, provenanceQuery: project.query, iedRef: staged.ied, ... }),
 * )
 */
export async function stageIsd(
	tx: Core.Transaction<Config>,
	params: StageIsdParams,
): Promise<StageIsdResult> {
	const read = await readStage(tx, params)
	await startFile(tx, {
		as: 'new',
		filename: STAGE_FILE.filename,
		header: { fileType: STAGE_FILE.fileType, tool: STAGE_FILE.tool },
		item: { who: STAGE_FILE.who, what: STAGE_FILE.what, why: STAGE_FILE.why },
	})
	const staged = await stageLNodes(tx, { sourceQuery: params.sourceQuery, plan: read.plan })
	const ied = await copyShell(tx, params)
	const build = await buildIed(tx, {
		...params.build,
		ied,
		lnodes: params.lnodes.flatMap((lnode) => staged.get(lnode.id) ?? []),
		contextQuery: params.sourceQuery,
		ldNameAlsoFits: [params.iedName, TEMPLATE_ISD_IED_NAME],
	})
	return {
		ied,
		build,
		released: read.bound.flatMap((id) => staged.get(id) ?? []),
	}
}

/** What staging writes, read and decided before the first write: the frame plan and the LNodes bound in the project. */
async function readStage(
	tx: Core.Transaction<Config>,
	params: StageIsdParams,
): Promise<{ plan: IedProcessPlan; bound: string[] }> {
	const { sourceQuery, lnodes, shell, iedName } = params
	const root = await tx.getRoot()
	const held = root.children.find((child) => EXPORTED_ROOT_TAGS.has(child.tagName))
	if (held) refuse({ reason: 'target-not-empty', ref: held })
	if (lnodes.length === 0) refuse({ reason: 'no-lnodes' })
	const nameIssue = await tx.validate.value({
		parent: root,
		tagName: 'IED',
		attribute: 'name',
		value: iedName,
	})
	if (nameIssue) refuse({ reason: 'ied-name' })
	const shells = await classifyIeds(shell.query)
	const shellIed = shells.find((classification) => classification.ied.id === shell.ied.id)
	if (!shellIed) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: shell.ied,
			detail: `${STAGE_VERB}: the shell document holds no <IED> "${shell.ied.id}"`,
		})
	}
	if (shellIed.kind === 'implemented') refuse({ reason: 'shell-not-specification', ref: shell.ied })

	const section = await readProcessSection(sourceQuery)
	const index = indexProcessSection(section)
	const rootIds = new Set(index.roots.map((node) => node.record.id))
	const outside = lnodes.find(function isOutsideProcess(lnode) {
		return !rootIds.has(index.byId.get(lnode.id)?.ancestry[1]?.id ?? '')
	})
	if (outside) refuse({ reason: 'lnode-outside-process', ref: outside })

	// an LNode given twice is staged once (the build drops a repeat itself)
	const ids = new Set(lnodes.map((lnode) => lnode.id))
	const satellites = await readSatelliteIndex(sourceQuery)
	const plan = planProcessFrames({
		index,
		satellites,
		lnodes: ids,
		iedUuids: new Set(),
		options: {},
	})
	const bound = [...ids].filter(function boundInProject(lnodeId) {
		const record = index.byId.get(lnodeId)?.record
		if (!record) return false
		const { iedName: boundTo, lnUuid } = readAttributes({ record, defaults: 'none' })
		return Boolean(lnUuid || (boundTo && boundTo !== UNALLOCATED_IED_NAME))
	})
	return { plan, bound }
}

/**
 * The frames cloned with the project's uuids and the LNodes' types, the plan's edits and namings not applied (they
 * would write the bound IED's naming over the specification), then every staged LNode released to its specification.
 * Returns each project LNode's staged copy, by project id.
 */
async function stageLNodes(
	tx: Core.Transaction<Config>,
	params: { sourceQuery: Core.Query<Config>; plan: IedProcessPlan },
): Promise<Map<string, Scl.Ref<'LNode'>>> {
	const cloneMappings = await cloneIedProcess(tx, params)
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'keep' })
	const staged = new Map(
		cloneMappings.flatMap(function stagedLNode(mapping): [string, Scl.Ref<'LNode'>][] {
			const { source, target } = mapping
			return source.tagName === 'LNode' && source.id && target.id
				? [[source.id, { tagName: 'LNode', id: target.id }]]
				: []
		}),
	)
	await releaseLNodeBindings(tx, { lnodes: [...staged.values()] })
	return staged
}

/** The shell IED copied without the files it came from nor any lineage, named `iedName`, `iedUuid` stamped when given. */
async function copyShell(
	tx: Core.Transaction<Config>,
	params: StageIsdParams,
): Promise<Scl.Ref<'IED'>> {
	const { shell, iedName, iedUuid } = params
	const root = await tx.getRoot()
	const copied = await deep(tx, {
		sourceQuery: shell.query,
		ref: shell.ied,
		targetParent: root,
		withTypes: { keepNameFrom: 'source' },
		omit: [...SHELL_OMITTED_TAGS],
	})
	await finalizeClonedIdentity(tx, {
		cloneMappings: copied.cloneMappings,
		mode: 'strip',
		unlinked: new Set(copied.cloneMappings.flatMap((mapping) => mapping.source.id ?? [])),
	})
	const ied = { tagName: 'IED' as const, id: copied.record.id }
	await tx.update(ied, { attributes: { name: iedName, ...(iedUuid ? { uuid: iedUuid } : {}) } })
	return ied
}

function refuse(params: { reason: StageRefusalReason; ref?: Scl.Ref<Scl.ElementsOf> }): never {
	const { reason, ref } = params
	throwDialecteError(SCL_ERRORS.SPECIFICATION_STAGE_REFUSED, {
		...(ref ? { ref } : {}),
		meta: { reason, stage: STAGE_VERB, ...(ref ? { ref } : {}) },
		detail: `${STAGE_VERB}: ${reason}`,
	})
}
