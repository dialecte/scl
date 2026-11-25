import {
	SHELL_FRAME_LN_CLASS,
	SHELL_OMITTED_TAGS,
	SHELL_STRIPPED_ATTRIBUTES,
} from './copy-ied-shell.constants'

import { importTypes } from '@/v2019C1/extensions/data-model/transaction/import-types'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'
import { readAttributes } from '@/v2019C1/helpers'

import type { CopyIedShellParams, CopyIedShellResult, ShellLeftOut } from './copy-ied-shell.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Copy a template IED as the shell of an IED built from a specification: the IED itself (its attributes, not its
 * `desc`), its `Services`, each `AccessPoint` with its `Server` and `Authentication`. What a specification builds from
 * its LNodes is not copied: the template's logical devices (its own LD0 included, with their logical nodes, data sets,
 * control blocks and inputs), an access point's own logical nodes, the associations; nor the files it came from, nor any
 * lineage. The types of the template's LN0 and LPHD are imported, for the LN0 and LPHD the build adds. The copied IED is
 * named `iedName`, `iedUuid` stamped when given; its servers hold no logical device until the build writes them.
 *
 * Returns the copied IED and what was left out (`leftOut`: the logical devices, then the access point logical nodes,
 * then the associations), for the caller to say.
 *
 * @intent copy only the shell of a template ISD's IED, build an S-IED from a template without its logical devices
 *
 * @example
 * const { ied, leftOut } = await tx.specification.copyIedShell({ shell: { query: template.query, ied }, iedName: 'P1' })
 * await tx.specification.buildIed({ ied, lnodes })
 */
export async function copyIedShell(
	tx: Core.Transaction<Config>,
	params: CopyIedShellParams,
): Promise<CopyIedShellResult> {
	const { shell, iedName, iedUuid } = params
	const held = await shell.query.findDescendants(shell.ied, {
		collect: ['Server', 'LDevice', 'LN0', 'LN', 'Association'],
	})
	const lDevices = inServerOrder({
		servers: (held.Server ?? []) as AnyRawRecord[],
		records: (held.LDevice ?? []) as AnyRawRecord[],
	})
	const lnZeros = (held.LN0 ?? []) as AnyRawRecord[]
	const lns = (held.LN ?? []) as AnyRawRecord[]
	const root = await tx.getRoot()
	const copied = await deep(tx, {
		sourceQuery: shell.query,
		ref: shell.ied,
		targetParent: root,
		withTypes: false,
		omit: [...SHELL_OMITTED_TAGS],
		strip: { scope: 'root', attributes: [...SHELL_STRIPPED_ATTRIBUTES] },
	})
	await finalizeClonedIdentity(tx, {
		cloneMappings: copied.cloneMappings,
		mode: 'strip',
		unlinked: new Set(copied.cloneMappings.flatMap((mapping) => mapping.source.id ?? [])),
	})
	const ied = { tagName: 'IED' as const, id: copied.record.id }
	await tx.update(ied, { attributes: { name: iedName, ...(iedUuid ? { uuid: iedUuid } : {}) } })
	// a type the template does not hold is not imported: the build gives the LN0 or LPHD a type by its rules
	const known = await lnodeTypeIdsOf({ query: shell.query })
	const frameTypes = frameTypesOf({ lnZeros, lns }).filter((typeId) => known.has(typeId))
	if (frameTypes.length > 0)
		await importTypes(tx, { sourceQuery: shell.query, records: [], lnodeTypeIds: frameTypes })
	return {
		ied,
		leftOut: [
			...lDevices.map((record) => refOf({ record, tagName: 'LDevice' })),
			...lns
				.filter((record) => record.parent?.tagName === 'AccessPoint')
				.map((record) => refOf({ record, tagName: 'LN' })),
			...((held.Association ?? []) as AnyRawRecord[]).map((record) =>
				refOf({ record, tagName: 'Association' }),
			),
		],
	}
}

/** The records in the order their servers hold them, server after server. */
function inServerOrder(params: {
	servers: readonly AnyRawRecord[]
	records: readonly AnyRawRecord[]
}): AnyRawRecord[] {
	const byId = new Map(params.records.map((record) => [record.id, record]))
	return params.servers.flatMap((server) =>
		server.children.flatMap((child) => byId.get(child.id) ?? []),
	)
}

/** The types of the template's LN0 and LPHD logical nodes, each once, in document order. */
function frameTypesOf(params: {
	lnZeros: readonly AnyRawRecord[]
	lns: readonly AnyRawRecord[]
}): string[] {
	const frames = [
		...params.lnZeros,
		...params.lns.filter(
			(record) => readAttributes({ record, defaults: 'none' }).lnClass === SHELL_FRAME_LN_CLASS,
		),
	]
	const types = frames.flatMap(
		(record) => readAttributes({ record, defaults: 'none' }).lnType ?? [],
	)
	return [...new Set(types)]
}

/** The ids of a document's LNodeTypes, read once. */
export async function lnodeTypeIdsOf(params: { query: Core.Query<Config> }): Promise<Set<string>> {
	const typeRecords = await params.query.getRecordsByTagName('LNodeType')
	return new Set(typeRecords.map((record) => readAttributes({ record, defaults: 'none' }).id ?? ''))
}

function refOf(params: { record: AnyRawRecord; tagName: ShellLeftOut['tagName'] }): ShellLeftOut {
	return { tagName: params.tagName, id: params.record.id } as ShellLeftOut
}
