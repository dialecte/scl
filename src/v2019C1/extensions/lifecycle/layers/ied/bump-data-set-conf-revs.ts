import { CONF_REV_CONTROL_TAGS } from './bump-data-set-conf-revs.constants'
import { nextConfRev } from './conf-rev'

import { toRef } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'

import type {
	ConfRevBumps,
	Reader,
	TemplateBlock,
	TemplateBlocks,
} from './bump-data-set-conf-revs.types'
import type { Config } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type {
	ConfRevBump,
	ConfRevNotRaised,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRef, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The configuration revision each control block naming a data set takes when the data set changes: one above its own,
 * for every report, GOOSE or sampled value control block of the data set's logical node whose `datSet` is the data
 * set's name — the project's own blocks included — except one whose lineage (under the scenario's key, or the source
 * uuid it is read as: a block paired by key) names a block the template no longer holds anywhere in the IED (the update
 * removes it). A block the template raises above it itself takes the template's value: its raise is listed for when
 * that block's own change is skipped (`onlyIfBlockSkipped`), and an apply writes it only then. A counter that is no
 * unsigned 32-bit number, or would pass its limit, is not raised: listed in `notRaised`. Reads the data set's logical
 * node's control blocks at once; the template's are given (`templateBlocks`).
 */
export async function readConfRevBumps(
	reader: Reader,
	params: {
		instanceDataSet: AnyTreeRecord
		/** The template's control blocks by uuid, read once from the template's tree: see `readTemplateBlocks`. */
		templateBlocks: TemplateBlocks
		matchKey: MatchKey
		/** An instance uuid read as the source uuid it stands for (a block paired by key, an element mapped onto). */
		redirectedSourceUuids: ReadonlyMap<string, string>
		/** An apply's decided groups: a block's raise the template's own change replaces waits on it. None: a report. */
		accepted?: AcceptedIds
		/** Whether the apply writes every change (no decisions): a block the template raises takes its value. */
		writesAll?: boolean
	},
): Promise<ConfRevBumps> {
	const { instanceDataSet, templateBlocks, matchKey } = params
	const name = readAttribute({ record: instanceDataSet, name: 'name', defaults: 'none' })
	const instanceBlocks = await controlBlocksOf(reader, { dataSet: instanceDataSet })
	const bumps: ConfRevBump[] = []
	const notRaised: ConfRevNotRaised[] = []
	for (const block of instanceBlocks) {
		if (readAttribute({ record: block, name: 'datSet', defaults: 'none' }) !== name) continue
		const before = readAttribute({ record: block, name: 'confRev', defaults: 'none' })
		const lineage = lineageOf({
			block,
			matchKey,
			redirectedSourceUuids: params.redirectedSourceUuids,
		})
		const template = lineage ? templateBlocks.get(lineage) : undefined
		// a block the template no longer holds goes with the update
		if (lineage && !template) continue
		const raisedByTemplate =
			template !== undefined && isAbove({ revision: template.confRev, than: before })
		if (raisedByTemplate && writesTemplateRevision({ template, ...params })) continue
		const next = nextConfRev({ value: before, step: 1 })
		if (!('next' in next)) {
			notRaised.push({ controlBlock: toRef(block), value: before, refusal: next.refusal })
			continue
		}
		bumps.push({
			controlBlock: toRef(block),
			before,
			after: next.next,
			...(raisedByTemplate ? { onlyIfBlockSkipped: true as const } : {}),
		})
	}
	return { bumps, notRaised }
}

/**
 * Whether an apply writes the template's own revision of a block: everything written, or the block's change accepted.
 * A report lists the raise either way, for when the block's change is skipped.
 */
function writesTemplateRevision(params: {
	template: TemplateBlock | undefined
	accepted?: AcceptedIds
	writesAll?: boolean
}): boolean {
	if (params.writesAll) return true
	if (!params.accepted || !params.template) return false
	return params.accepted.sourceIds.has(params.template.id)
}

/** The template's control blocks with a configuration revision, by uuid, from its tree as held: no read. */
export function readTemplateBlocks(params: { sourceTree: AnyTreeRecord }): TemplateBlocks {
	return new Map(
		flatten(params.sourceTree).flatMap((node): [string, TemplateBlock][] => {
			if (!CONF_REV_CONTROL_TAGS.has(node.tagName)) return []
			const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
			const confRev = readAttribute({ record: node, name: 'confRev', defaults: 'none' })
			return uuid ? [[uuid, { id: node.id, confRev }]] : []
		}),
	)
}

/** A tree's nodes, the root first. */
function flatten(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flatten)]
}

/**
 * The template block a project block stands for: the source uuid its own uuid is read as (paired by key, mapped onto),
 * else its lineage under the scenario's key; empty for a block of the project's own.
 */
function lineageOf(params: {
	block: AnyTrackedRecord
	matchKey: MatchKey
	redirectedSourceUuids: ReadonlyMap<string, string>
}): string {
	const { block, matchKey } = params
	const uuid = readAttribute({ record: block, name: 'uuid', defaults: 'none' })
	return (
		params.redirectedSourceUuids.get(uuid) ??
		readAttribute({ record: block, name: matchKey, defaults: 'none' })
	)
}

/** Whether a configuration revision is above another (both unsigned counters). */
function isAbove(params: { revision: string; than: string }): boolean {
	const { revision, than } = params
	if (!/^\d+$/.test(revision) || !/^\d+$/.test(than)) return false
	return Number(revision) > Number(than)
}

/** Write each control block's raised configuration revision. */
export async function writeConfRevBumps(
	tx: Core.Transaction<Config>,
	params: { bumps: readonly ConfRevBump[] },
): Promise<void> {
	// a block the walk removed after the bump was read is gone: nothing to raise
	const blocks = await tx.any.getRecords(params.bumps.map((bump) => toRef(bump.controlBlock)))
	for (const [position, bump] of params.bumps.entries()) {
		if (blocks[position])
			await tx.any.update(bump.controlBlock, { attributes: { confRev: bump.after } })
	}
}

/** The control blocks with a configuration revision of the logical node holding a data set, read at once. */
async function controlBlocksOf(
	reader: Reader,
	params: { dataSet: AnyTreeRecord },
): Promise<AnyTrackedRecord[]> {
	if (!params.dataSet.parent) return []
	const logicalNode = await reader.any.getRecord(params.dataSet.parent)
	const refs: AnyRef[] = (logicalNode?.children ?? []).filter((child) =>
		CONF_REV_CONTROL_TAGS.has(child.tagName),
	)
	if (refs.length === 0) return []
	const blocks = await reader.any.getRecords(refs)
	return blocks.filter((block): block is AnyTrackedRecord => block !== undefined)
}
