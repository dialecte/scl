import { COPY_REFERENCE_GROUP_PREFIX } from './copy.constants'

import { isAccepted } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { planReferences } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/plan-references'
import { PROCESS_REFERENCE_FAMILIES } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.constants'

import type { PlanCopyReferencesParams } from './copy.types'
import type {
	DecisionGroup,
	DecisionMap,
	DiffNode,
	OutsideReference,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type {
	ClassifiedReference,
	ProcessReferenceFamily,
	ProcessReferencePolicy,
	ReferencePlan,
} from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.types'

/**
 * What a copy does with the process references its roots carry out of what it copies (the shared planner's process half):
 * the references naming what it copies follow the copy, those naming nothing stay as written (one document: a legacy
 * dangling reference), and those naming an element of the document outside it are kept, or dropped in their family's
 * shape when the consumer skipped that family's group (`dropped`).
 */
export async function planCopyReferences(params: PlanCopyReferencesParams): Promise<ReferencePlan> {
	const { roots, query, dropped } = params
	return planReferences({
		roots: roots.map((ref) => ({ ref, depth: 'whole' })),
		sourceQuery: query,
		destinationQuery: query,
		processPolicy: copyReferencePolicy({ dropped }),
	})
}

/** The policy of a copy: everything kept, but the families the consumer dropped, for what the document holds outside it. */
function copyReferencePolicy(params: {
	dropped: ReadonlySet<ProcessReferenceFamily>
}): ProcessReferencePolicy {
	const families = Object.keys(PROCESS_REFERENCE_FAMILIES) as ProcessReferenceFamily[]
	return Object.fromEntries(
		families.map((family) => [
			family,
			{
				inside: 'keep',
				present: params.dropped.has(family) ? 'drop' : 'keep',
				absent: 'keep',
			},
		]),
	) as ProcessReferencePolicy
}

/**
 * One group per family whose references name an element of the document outside the copy: kept by default, bound to no
 * group (a skipped root's references ask nothing), each row saying what a skip does to it (`cleared`: its link removed,
 * the holder kept; `deleted`: the holder not written).
 */
export function describeReferenceGroups(params: { plan: ReferencePlan }): DecisionGroup[] {
	const byFamily = new Map<ProcessReferenceFamily, ClassifiedReference[]>()
	for (const reference of params.plan.references) {
		// a reference the document holds the target of: what a group decides
		if (reference.class !== 'present' || !reference.target || !isProcessFamily(reference.family))
			continue
		byFamily.set(reference.family, [...(byFamily.get(reference.family) ?? []), reference])
	}
	return [...byFamily].map(function groupOf([family, references]): DecisionGroup {
		const effect = PROCESS_REFERENCE_FAMILIES[family].drop === 'reduce' ? 'cleared' : 'deleted'
		const rows: OutsideReference[] = references.flatMap(({ holder, target }) =>
			target
				? [
						{
							holder: { tagName: holder.tagName, id: holder.id },
							target: { tagName: target.tagName, id: target.id },
							effect,
						},
					]
				: [],
		)
		const [primary, ...companions] = references.map(nodeOf)
		return {
			id: `${COPY_REFERENCE_GROUP_PREFIX}${family}`,
			change: 'added',
			title: `keep references ${family}`,
			primary,
			companions,
			dependsOn: [],
			suggestedAction: 'accept',
			kind: 'references',
			references: rows,
		}
	})
}

/** The families whose group the consumer skipped: those dropped. Without decisions, none. */
export function droppedFamilies(params: {
	groups: readonly DecisionGroup[]
	decisions: DecisionMap | undefined
}): Set<ProcessReferenceFamily> {
	const { groups, decisions } = params
	const dropped = new Set<ProcessReferenceFamily>()
	for (const group of groups) {
		if (group.kind !== 'references') continue
		if (isAccepted({ group, decisions: decisions ?? new Map() })) continue
		const family = group.id.slice(COPY_REFERENCE_GROUP_PREFIX.length)
		if (isProcessFamily(family)) dropped.add(family)
	}
	return dropped
}

/** A reference's holder as a report node: written by the copy, as its root's group writes it. */
function nodeOf(reference: ClassifiedReference): DiffNode {
	return {
		change: 'added',
		tagName: reference.holder.tagName,
		sourceRef: reference.holder,
		children: [],
	}
}

function isProcessFamily(family: string): family is ProcessReferenceFamily {
	return family in PROCESS_REFERENCE_FAMILIES
}
