import { CONF_REV_CONTROL_TAGS } from './bump-data-set-conf-revs.constants'
import { nextConfRev } from './conf-rev'

import { toRef } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'

import type { Config } from '@/v2019C1/config'
import type { ConfRevBump } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRef, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The configuration revision each control block naming a data set takes when the data set changes: one above its own,
 * for every report, GOOSE or sampled value control block of the data set's logical node whose `datSet` is the data
 * set's name — the project's own blocks included — except one whose lineage (under the scenario's key, or the source
 * uuid it is read as: a block paired by key) names a block the template no longer holds (the update removes it), one the template's counterpart raises above it itself (its
 * value is written instead), and one whose counter is no unsigned 32-bit number or would pass its limit (left as it
 * is). Reads the two logical nodes' control blocks at once each.
 */
export async function readConfRevBumps(
	reader: Reader,
	params: {
		instanceDataSet: AnyTreeRecord
		sourceQuery: Reader
		sourceDataSet: AnyTreeRecord
		matchKey: MatchKey
		/** An instance uuid read as the source uuid it stands for (a block paired by key, an element mapped onto). */
		redirectedSourceUuids: ReadonlyMap<string, string>
	},
): Promise<ConfRevBump[]> {
	const { instanceDataSet, sourceQuery, sourceDataSet, matchKey } = params
	const name = readAttribute({ record: instanceDataSet, name: 'name', defaults: 'none' })
	const instanceBlocks = await controlBlocksOf(reader, { dataSet: instanceDataSet })
	const sourceBlocks = await controlBlocksOf(sourceQuery, { dataSet: sourceDataSet })
	const templateRevisions = new Map(
		sourceBlocks.map((block): [string, string] => [
			readAttribute({ record: block, name: 'uuid', defaults: 'none' }),
			readAttribute({ record: block, name: 'confRev', defaults: 'none' }),
		]),
	)
	return instanceBlocks.flatMap((block): ConfRevBump[] => {
		if (readAttribute({ record: block, name: 'datSet', defaults: 'none' }) !== name) return []
		const before = readAttribute({ record: block, name: 'confRev', defaults: 'none' })
		const lineage = lineageOf({
			block,
			matchKey,
			redirectedSourceUuids: params.redirectedSourceUuids,
		})
		if (lineage) {
			const template = templateRevisions.get(lineage)
			// a block the template no longer holds goes with the update; one it raises itself takes its value
			if (template === undefined || isAbove({ revision: template, than: before })) return []
		}
		const next = nextConfRev({ value: before, step: 1 })
		return 'next' in next ? [{ controlBlock: toRef(block), before, after: next.next }] : []
	})
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
	const blocks = await tx.any.getRecords([...params.bumps.map((bump) => toRef(bump.controlBlock))])
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
