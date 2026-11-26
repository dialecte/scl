import { cutPairLink } from './process-link-cut'
import { PROCESS_REFERENCE_FAMILIES } from './reference-closure.constants'

import { toRef } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { readAttribute } from '@/v2019C1/helpers'
import { findTargetsByUuid } from '@/v2019C1/hooks/shared/find-targets-by-uuid'

import type {
	ClassifiedReference,
	ProcessReferenceFamily,
	ProcessReferencePolicy,
	ReferenceClass,
	ReferencePlan,
} from './reference-closure.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type {
	RecordEdit,
	ReferencePair,
} from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/** A holder of a process family, its pair, and the uuid it names. */
type ProcessHolder = {
	record: AnyRawRecord
	family: ProcessReferenceFamily
	pair: ReferencePair
	uuid: string
}

/**
 * The process references the roots hold (`PROCESS_REFERENCE_FAMILIES`): each classified by the uuid it names — `inside`
 * when a record the roots hold carries it, `present` when the destination holds an element of the pair's target tags
 * carrying it, `absent` else — then kept, or dropped in its family's shape: an input or output specification keeps its
 * content and loses its link, the expected data filled (`cutPairLink`, the export's shape, told as `process-reference-cut`);
 * a function reference or a terminal is left out. Reads what the roots hold once, and the targets sought once per tag.
 */
export async function planProcessReferences(params: {
	roots: readonly Scl.Ref<Scl.ElementsOf>[]
	sourceQuery: Core.Query<Config>
	destinationQuery: Core.Query<Config>
	policy: ProcessReferencePolicy
}): Promise<ReferencePlan> {
	const { roots, sourceQuery, destinationQuery, policy } = params
	const [rootRecords, below] = await Promise.all([
		sourceQuery.any.getRecords([...roots]),
		sourceQuery.any.findDescendantsOfEach([...roots]),
	])
	const held = [
		...rootRecords.flatMap((record) => (record ? [record] : [])),
		...below.flatMap((byTag) => Object.values(byTag).flat()),
	] as AnyRawRecord[]
	const insideUuids = new Set(
		held.flatMap((record) => {
			const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
			return uuid ? [uuid] : []
		}),
	)
	const holders = held.filter(isNativeRecord).flatMap(holdersOf)
	const outside = holders.filter((holder) => !insideUuids.has(holder.uuid))
	const targets = await findTargetsByUuid(destinationQuery, {
		sought: outside.map((holder) => ({ uuid: holder.uuid, targetTagNames: holder.pair.target })),
	})
	const targetOf = new Map(
		outside.map((holder, index) => [holder.record.id, targets[index]] as const),
	)

	const references: ClassifiedReference[] = []
	const leaveOut = new Set<string>()
	const edits: RecordEdit[] = []
	const warnings: ExtractWarning[] = []
	for (const holder of holders) {
		const target = targetOf.get(holder.record.id)
		const referenceClass: ReferenceClass = insideUuids.has(holder.uuid)
			? 'inside'
			: target
				? 'present'
				: 'absent'
		const { drop } = PROCESS_REFERENCE_FAMILIES[holder.family]
		const dropped = policy[holder.family][referenceClass] === 'drop'
		const ref = toRef(holder.record) as Scl.Ref<Scl.ElementsOf>
		references.push({
			holder: ref,
			family: holder.family,
			direction: 'outgoing',
			class: referenceClass,
			...(target ? { target: toRef(target) as Scl.Ref<Scl.ElementsOf> } : {}),
			action: dropped ? drop : 'keep',
		})
		if (!dropped) continue
		if (drop === 'remove') {
			leaveOut.add(holder.record.id)
			continue
		}
		const cut = cutPairLink({ record: holder.record, pair: holder.pair, target })
		edits.push({ ref, attributes: cut.attributes })
		warnings.push({
			code: 'process-reference-cut',
			source: ref as Scl.Ref<'SourceRef' | 'ControlRef'>,
			attributes: cut.removed.toSorted(),
		})
	}
	return { references, leaveOut, edits, warnings }
}

/** The process references a record holds: one per family whose holder it is, when it names a uuid. */
function holdersOf(record: AnyRawRecord): ProcessHolder[] {
	return Object.entries(PROCESS_REFERENCE_FAMILIES).flatMap(function holderOf([family, row]) {
		if (record.tagName !== row.holder) return []
		const pair = (UUID_REFERENCE_PAIRS[row.holder] as readonly ReferencePair[]).find(
			(candidate) => candidate.attribute.uuid === row.uuidAttribute,
		)
		const uuid = readAttribute({ record, name: row.uuidAttribute, defaults: 'none' })
		return pair && uuid ? [{ record, family: family as ProcessReferenceFamily, pair, uuid }] : []
	})
}
