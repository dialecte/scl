import { buildIed } from './build-ied'
import { copyIedShell, lnodeTypeIdsOf } from './copy-ied-shell'
import { SHELL_FRAME_LN_CLASS } from './copy-ied-shell.constants'
import { STAGE_FILE, STAGE_VERB } from './stage-isd.constants'

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
import type {
	IedProcessPlan,
	ProcessIndex,
} from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
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
 * schema refuses (`ied-name`); a shell IED of a real device (`shell-not-specification`); a logical node of the shell IED
 * naming an LNodeType the shell document lacks (`type-missing`); an LNode the project does not hold or holds outside its
 * substations, lines and processes (`lnode-outside-process`); an LNode naming an LNodeType the project lacks
 * (`type-missing`); checked in that order, the first refusing. An LNode given twice is staged once. The build's own refusals pass through
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
	const shellCopy = await copyIedShell(tx, {
		shell: params.shell,
		iedName: params.iedName,
		...(params.iedUuid ? { iedUuid: params.iedUuid } : {}),
	})
	const ied = shellCopy.ied
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
		shellLeftOut: shellCopy.leftOut,
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
	const shellUntyped = await shellLnNamingNoType({ shell })
	if (shellUntyped) {
		refuse({
			reason: 'type-missing',
			ref: shellUntyped.ln,
			detail: `the shell's logical node names the LNodeType ${shellUntyped.lnType}, which the shell document does not hold`,
		})
	}

	const section = await readProcessSection(sourceQuery)
	const index = indexProcessSection(section)
	const rootIds = new Set(index.roots.map((node) => node.record.id))
	const outside = lnodes.find(function isOutsideProcess(lnode) {
		return !rootIds.has(index.byId.get(lnode.id)?.ancestry[1]?.id ?? '')
	})
	if (outside) refuse({ reason: 'lnode-outside-process', ref: outside })
	const untyped = await lnodeNamingNoType({ sourceQuery, lnodes, index })
	if (untyped) {
		refuse({
			reason: 'type-missing',
			ref: untyped.lnode,
			detail: `the LNode names the LNodeType ${untyped.lnType}, which the project does not hold`,
		})
	}

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

/**
 * The first LN0 or LPHD of the shell IED (the logical nodes whose types the shell copy imports) whose `lnType` names no
 * LNodeType of the shell document, with that type.
 */
async function shellLnNamingNoType(params: {
	shell: StageIsdParams['shell']
}): Promise<{ ln: Scl.Ref<'LN' | 'LN0'>; lnType: string } | undefined> {
	const { shell } = params
	const held = await shell.query.findDescendants(shell.ied, { collect: ['LN0', 'LN'] })
	const typeIds = await lnodeTypeIdsOf({ query: shell.query })
	const frames = [
		...(held.LN0 ?? []),
		...(held.LN ?? []).filter(
			(record) => readAttributes({ record, defaults: 'none' }).lnClass === SHELL_FRAME_LN_CLASS,
		),
	]
	for (const record of frames) {
		const { lnType } = readAttributes({ record, defaults: 'none' })
		if (lnType && !typeIds.has(lnType))
			return { ln: { tagName: record.tagName, id: record.id }, lnType }
	}
	return undefined
}

/** The first LNode given whose `lnType` names no LNodeType of the project, with that type; the types read once. */
async function lnodeNamingNoType(params: {
	sourceQuery: Core.Query<Config>
	lnodes: readonly Scl.Ref<'LNode'>[]
	index: ProcessIndex
}): Promise<{ lnode: Scl.Ref<'LNode'>; lnType: string } | undefined> {
	const { sourceQuery, lnodes, index } = params
	const typeIds = await lnodeTypeIdsOf({ query: sourceQuery })
	for (const lnode of lnodes) {
		const record = index.byId.get(lnode.id)?.record
		const lnType = record ? readAttributes({ record, defaults: 'none' }).lnType : undefined
		if (lnType && !typeIds.has(lnType)) return { lnode, lnType }
	}
	return undefined
}

function refuse(params: {
	reason: StageRefusalReason
	ref?: Scl.Ref<Scl.ElementsOf>
	detail?: string
}): never {
	const { reason, ref, detail } = params
	throwDialecteError(SCL_ERRORS.SPECIFICATION_STAGE_REFUSED, {
		...(ref ? { ref } : {}),
		meta: { reason, stage: STAGE_VERB, ...(ref ? { ref } : {}) },
		detail: `${STAGE_VERB}: ${detail ?? reason}`,
	})
}
