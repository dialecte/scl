import {
	COMPOSING_REFERENCE_TAG,
	COMPOSING_REFERENCE_UUID,
	NO_VARIANT_SELECTION,
	VARIANT_MARKER_ATTRIBUTES,
	VARIANT_MARKER_REMOVES,
	VARIANT_MARKER_TAG,
	VARIANT_SET_HOLDER_TAGS,
	VARIANT_TAGS,
} from './variant-selection.constants'

import { toRef } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	ResolvedVariantSet,
	VariantSelection,
	VariantTemplate,
} from './variant-selection.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey, NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * An application template, read for the selections of its instances: undefined when the application holds no
 * functional variant (nothing any instance could have selected), or when the names of an update follow the source (a
 * revision of the same file holds its variants as content).
 */
export async function readVariantTemplate(
	sourceQuery: Core.Query<Config>,
	params: { applicationRef: Scl.Ref<'Application'>; namesFollow: NamesFollow },
): Promise<VariantTemplate | undefined> {
	const { applicationRef, namesFollow } = params
	if (namesFollow !== 'project') return undefined
	const applicationTree = await sourceQuery.any.getTree(applicationRef)
	if (!applicationTree || !holdsVariant(applicationTree)) return undefined

	const [sourceRoot] = await sourceQuery.getRecordsByTagName('SCL')
	const documentTree = sourceRoot ? await sourceQuery.any.getTree(sourceRoot) : undefined
	if (!documentTree) return undefined
	const parents = new Map<string, AnyTreeRecord>()
	const byUuid = new Map<string, AnyTreeRecord>()
	const application = indexTree({ node: documentTree, id: applicationRef.id, parents, byUuid })
	return application ? { application, documentTree, parents, byUuid } : undefined
}

function holdsVariant(node: AnyTreeRecord): boolean {
	return VARIANT_TAGS.has(node.tagName) || node.tree.some(holdsVariant)
}

/**
 * The functional variants an instance of an application selected, read from what it holds, and what of its template
 * the selection leaves out. A set of exclusive variants (an application's variants, a group's, a variant's
 * sub-variants) is selected when the template holds several and the instance one of them, matched by its lineage, else
 * its name; an instance holding several has selected nothing yet. The selection leaves out:
 * - the variants not selected;
 * - every marker naming a variant of a selected set: the selection consumed it;
 * - every element a selected set excludes: one of its markers of that set removes it with the variant selected, or
 *   its markers of that set adding it all name variants not selected;
 * - every function the excluded elements compose that no element kept composes, neither it nor anything below it;
 * - every reference of the template naming an element inside what is left out.
 *
 * The template is read once by the caller (`readVariantTemplate`): none, nothing is left out.
 */
export async function readVariantSelection(
	query: Core.Query<Config>,
	params: {
		template: VariantTemplate | undefined
		instance: AnyRefOrRecord | undefined
		matchKey: MatchKey
	},
): Promise<VariantSelection> {
	const { template, instance, matchKey } = params
	if (!template || !instance) return NO_VARIANT_SELECTION
	const instanceTree = await query.any.getTree(instance)
	if (!instanceTree) return NO_VARIANT_SELECTION
	const { application: sourceTree, documentTree } = template

	const sets: ResolvedVariantSet[] = []
	collectResolvedSets({ sourceNode: sourceTree, instanceNode: instanceTree, matchKey, out: sets })
	if (sets.length === 0) return NO_VARIANT_SELECTION

	const leftOut = new Set<string>()
	const composition = { kept: new Set<string>(), excluded: new Set<string>() }
	// a variant not selected is left out with its sub-variants
	const notSelected = sets.flatMap((set) => (set.selected ? set.notSelected : []))
	for (const variant of notSelected) leftOut.add(variant.id)
	applySelection({ node: sourceTree, sets, leftOut, composition, excluded: false })

	const leftOutFunctions = findUncomposedFunctions({ template, composition })
	for (const fn of leftOutFunctions) leftOut.add(fn.id)
	leaveOutDanglingReferences({ documentTree, leftOut })
	const within = new Set<string>()
	collectWithin({ node: documentTree, leftOut, inside: false, out: within })

	return {
		variantsNotSelected: notSelected.map((variant) => toRef(variant)),
		leftOut,
		within,
	}
}

/**
 * What every one of several selections leaves out: a function several instances compose is left out only when none
 * of them uses it.
 */
export function sharedSelection(selections: readonly VariantSelection[]): VariantSelection {
	const [first, ...others] = selections
	if (!first) return NO_VARIANT_SELECTION
	return {
		variantsNotSelected: [],
		leftOut: inEvery({ ids: first.leftOut, others: others.map((other) => other.leftOut) }),
		within: inEvery({ ids: first.within, others: others.map((other) => other.within) }),
	}
}

function inEvery(params: {
	ids: ReadonlySet<string>
	others: readonly ReadonlySet<string>[]
}): ReadonlySet<string> {
	const { ids, others } = params
	return new Set([...ids].filter((id) => others.every((other) => other.has(id))))
}

/** The node of a tree by its record id, recording the tree parent and the uuid of every node walked. */
function indexTree(params: {
	node: AnyTreeRecord
	id: string | undefined
	parents: Map<string, AnyTreeRecord>
	byUuid: Map<string, AnyTreeRecord>
}): AnyTreeRecord | undefined {
	const { node, id, parents, byUuid } = params
	const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
	if (uuid) byUuid.set(uuid, node)
	let found: AnyTreeRecord | undefined = node.id === id ? node : undefined
	for (const child of node.tree) {
		parents.set(child.id, node)
		const inChild = indexTree({ ...params, node: child })
		found = found ?? inChild
	}
	return found
}

/** The sets of exclusive variants below a holder of the template the instance selected one member of. */
function collectResolvedSets(params: {
	sourceNode: AnyTreeRecord
	instanceNode: AnyTreeRecord
	matchKey: MatchKey
	out: ResolvedVariantSet[]
}): void {
	const { sourceNode, instanceNode, matchKey, out } = params
	const variants = sourceNode.tree.filter((child) => VARIANT_TAGS.has(child.tagName))
	const held = variants.filter((variant) =>
		counterpart({ sourceNode: variant, instanceNode, matchKey }),
	)
	const [selected] = held
	const resolved = variants.length > 1 && held.length === 1 && selected !== undefined
	if (resolved)
		out.push({ selected, notSelected: variants.filter((variant) => variant !== selected) })

	for (const child of sourceNode.tree) {
		if (!VARIANT_SET_HOLDER_TAGS.has(child.tagName)) continue
		// the sub-variants of a variant not selected are not selected either
		if (resolved && VARIANT_TAGS.has(child.tagName) && child !== selected) {
			collectUnselectedSets({ sourceNode: child, out })
			continue
		}
		const instanceChild = counterpart({ sourceNode: child, instanceNode, matchKey })
		if (instanceChild)
			collectResolvedSets({ sourceNode: child, instanceNode: instanceChild, matchKey, out })
	}
}

/** The sets of variants below a variant not selected: none of their members is selected. */
function collectUnselectedSets(params: {
	sourceNode: AnyTreeRecord
	out: ResolvedVariantSet[]
}): void {
	const { sourceNode, out } = params
	const variants = sourceNode.tree.filter((child) => VARIANT_TAGS.has(child.tagName))
	if (variants.length > 0) out.push({ selected: undefined, notSelected: variants })
	for (const child of sourceNode.tree) {
		if (VARIANT_SET_HOLDER_TAGS.has(child.tagName))
			collectUnselectedSets({ sourceNode: child, out })
	}
}

/** The instance child standing for a source child: of its tag, carrying its uuid as lineage, else its name. */
function counterpart(params: {
	sourceNode: AnyTreeRecord
	instanceNode: AnyTreeRecord
	matchKey: MatchKey
}): AnyTreeRecord | undefined {
	const { sourceNode, instanceNode, matchKey } = params
	const candidates = instanceNode.tree.filter((child) => child.tagName === sourceNode.tagName)
	const uuid = readAttribute({ record: sourceNode, name: 'uuid', defaults: 'none' })
	const byLineage = uuid
		? candidates.find(
				(candidate) =>
					readAttribute({ record: candidate, name: matchKey, defaults: 'none' }) === uuid,
			)
		: undefined
	if (byLineage) return byLineage
	const name = readAttribute({ record: sourceNode, name: 'name', defaults: 'none' })
	return name
		? candidates.find(
				(candidate) =>
					readAttribute({ record: candidate, name: 'name', defaults: 'none' }) === name,
			)
		: undefined
}

/**
 * Walk the application: leave out the markers the selection consumed and the elements it excludes, and record the
 * functions the kept and the excluded elements compose.
 */
function applySelection(params: {
	node: AnyTreeRecord
	sets: readonly ResolvedVariantSet[]
	leftOut: Set<string>
	composition: { kept: Set<string>; excluded: Set<string> }
	excluded: boolean
}): void {
	const { node, sets, leftOut, composition } = params
	if (!params.excluded && leftOut.has(node.id)) return
	const excluded = params.excluded || excludedBySelection({ node, sets, leftOut })
	if (excluded && !params.excluded) leftOut.add(node.id)

	if (node.tagName === COMPOSING_REFERENCE_TAG) {
		const functionUuid = readAttribute({
			record: node,
			name: COMPOSING_REFERENCE_UUID,
			defaults: 'none',
		})
		if (functionUuid) (excluded ? composition.excluded : composition.kept).add(functionUuid)
	}
	for (const child of node.tree) applySelection({ ...params, node: child, excluded })
}

/**
 * Whether a selected set excludes an element: one of its markers of the set removes it with the variant selected, or
 * its markers of the set adding it all name variants not selected (an element a variant adds is in no other). Its
 * markers of a selected set are left out: the selection consumed them.
 */
function excludedBySelection(params: {
	node: AnyTreeRecord
	sets: readonly ResolvedVariantSet[]
	leftOut: Set<string>
}): boolean {
	const { node, sets, leftOut } = params
	const markers = node.tree.filter((child) => child.tagName === VARIANT_MARKER_TAG)
	let excluded = false
	for (const set of sets) {
		const ofSet = markers.flatMap((marker) => {
			const variant = namedVariant({ marker, set })
			return variant ? [{ marker, variant }] : []
		})
		if (ofSet.length === 0) continue
		for (const { marker } of ofSet) leftOut.add(marker.id)
		const removes = ofSet.filter(({ marker }) => removesWithVariant(marker))
		const adds = ofSet.filter(({ marker }) => !removesWithVariant(marker))
		const removedWithSelected = removes.some(({ variant }) => variant === set.selected)
		const addedOnlyWithOthers =
			adds.length > 0 && adds.every(({ variant }) => variant !== set.selected)
		if (removedWithSelected || addedOnlyWithOthers) excluded = true
	}
	return excluded
}

/**
 * The variant of a set a marker names, by its uuid: the import fills it from the name the marker gives (a marker
 * whose name names no variant of the application names none).
 */
function namedVariant(params: {
	marker: AnyTreeRecord
	set: ResolvedVariantSet
}): AnyTreeRecord | undefined {
	const { marker, set } = params
	const uuid = readAttribute({
		record: marker,
		name: VARIANT_MARKER_ATTRIBUTES.uuid,
		defaults: 'none',
	})
	if (!uuid) return undefined
	const variants = set.selected ? [set.selected, ...set.notSelected] : set.notSelected
	return variants.find(
		(variant) => readAttribute({ record: variant, name: 'uuid', defaults: 'none' }) === uuid,
	)
}

function removesWithVariant(marker: AnyTreeRecord): boolean {
	return readAttribute({ record: marker, name: 'update' }) === VARIANT_MARKER_REMOVES
}

/**
 * The functions the excluded elements compose that no kept element composes, neither them nor anything below them:
 * a function kept, and every function above it, stay.
 */
function findUncomposedFunctions(params: {
	template: VariantTemplate
	composition: { kept: ReadonlySet<string>; excluded: ReadonlySet<string> }
}): AnyTreeRecord[] {
	const { template, composition } = params
	const { parents, byUuid } = template

	const used = new Set<string>()
	for (const uuid of composition.kept) {
		let node = byUuid.get(uuid)
		while (node) {
			used.add(node.id)
			node = parents.get(node.id)
		}
	}
	return [...composition.excluded].flatMap((uuid) => {
		const fn = byUuid.get(uuid)
		return fn && !used.has(fn.id) ? [fn] : []
	})
}

/**
 * Leave out every reference of the template naming, by its uuid, an element inside what is left out: it would name
 * nothing in the instance. A reference left out may itself be named (a signal's input names a source reference): the
 * pass repeats until nothing more is left out.
 */
function leaveOutDanglingReferences(params: {
	documentTree: AnyTreeRecord
	leftOut: Set<string>
}): void {
	const { documentTree, leftOut } = params
	let size = 0
	while (leftOut.size !== size) {
		size = leftOut.size
		const leftOutUuids = new Set<string>()
		collectLeftOutUuids({ node: documentTree, leftOut, inside: false, out: leftOutUuids })
		leaveOutReferencesTo({ node: documentTree, leftOut, leftOutUuids })
	}
}

/** Every element inside what is left out, the elements left out included. */
function collectWithin(params: {
	node: AnyTreeRecord
	leftOut: ReadonlySet<string>
	inside: boolean
	out: Set<string>
}): void {
	const { node, leftOut, out } = params
	const inside = params.inside || leftOut.has(node.id)
	if (inside) out.add(node.id)
	for (const child of node.tree) collectWithin({ ...params, node: child, inside })
}

function collectLeftOutUuids(params: {
	node: AnyTreeRecord
	leftOut: ReadonlySet<string>
	inside: boolean
	out: Set<string>
}): void {
	const { node, leftOut, out } = params
	const inside = params.inside || leftOut.has(node.id)
	if (inside) {
		const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
		if (uuid) out.add(uuid)
	}
	for (const child of node.tree) collectLeftOutUuids({ ...params, node: child, inside })
}

function leaveOutReferencesTo(params: {
	node: AnyTreeRecord
	leftOut: Set<string>
	leftOutUuids: ReadonlySet<string>
}): void {
	const { node, leftOut, leftOutUuids } = params
	// what is already left out goes with what holds it
	if (leftOut.has(node.id)) return
	const pairs: readonly { attribute: { uuid: string } }[] =
		UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
	const namesLeftOut = pairs.some((pair) =>
		leftOutUuids.has(readAttribute({ record: node, name: pair.attribute.uuid, defaults: 'none' })),
	)
	if (namesLeftOut) {
		leftOut.add(node.id)
		return
	}
	for (const child of node.tree) leaveOutReferencesTo({ ...params, node: child })
}
