import { mergeChildrenInto } from '../../transplant/transaction/primitives/merge-children-into'

import { toRef } from '@dialecte/core/helpers'

import { FRAME_OMIT_CHILD_TAGS, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'

import type {
	EnsureTopologyFrameParams,
	EnsureTopologyFrameResult,
} from './ensure-topology-frame.types'
import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS
// A created frame element is a NEW element: drop the source `uuid` (the enforce hook mints a fresh
// one) and its template lineage. The identity finalization then stamps `templateUuid` (stamp) or
// restores the source `uuid` (keep) from the clone mappings — matching how fn/app clones behave.
const CREATE_STRIP_ATTRIBUTES = ['uuid', 'templateUuid', 'originUuid']

/** Own content omitted from the frame merge: structural levels (walked) + delegated fn/app content. */
const FRAME_OWN_CONTENT_OMIT = [...TOPOLOGY_STRUCTURAL_TAGS, ...FRAME_OMIT_CHILD_TAGS]

/**
 * Reproduce the source topology frame into the target, keyed by structural POSITION (never by name).
 *
 * The topology layer OWNS its structural frame (Substation/VoltageLevel/Bay + their `Private`/BayType,
 * equipment, connectivity). Each level lands where `placementLevels` says: on an element of the
 * target, left as it is, or created from source with its own content, OMITTING the delegated fn/app
 * children (the fn/app layers place those), and stamped by the caller so a later update can match it
 * by `templateUuid`. Without `placementLevels`, the levels ABOVE the scope root are reused from
 * `targetParent`'s existing chain where present and every other level is created (so an empty
 * target gets the whole chain).
 *
 * Returns a `frameIndex` (source structural id -> target ref) so callers place fn/app content under
 * the correct target level even across multiple bays.
 */
export async function ensureTopologyFrame(
	tx: Core.Transaction<Config>,
	params: EnsureTopologyFrameParams,
): Promise<EnsureTopologyFrameResult> {
	const { sourceQuery, scopeRef, targetParent, omit, leftOut } = params

	const levels =
		params.placementLevels ??
		(await reuseTargetAncestors(tx, { sourceQuery, scopeRef, targetParent }))

	const frameIndex = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	const createdIds = new Set<string>()
	const mappedUnitIds = new Set<string>()
	const cloneMappings: Scl.CloneMapping[] = []
	const redirectMappings: RedirectMapping[] = []
	// the levels above the unit are created for it only
	const unitWritten = !leftOut?.has(scopeRef.id ?? '')

	// 1. Each structural level lands where it was resolved: on an element of the target, or created.
	for (const level of levels) {
		const { sourceRef, parentSourceId, resolved, createName } = level

		if (resolved.existing) {
			const existingRef = toRef(resolved.existing) as Scl.Ref<Scl.ElementsOf>
			frameIndex.set(sourceRef.id, existingRef)
			if (!level.context) mappedUnitIds.add(sourceRef.id)
			const sourceUuid = await sourceQuery.any.getAttribute(sourceRef, { name: 'uuid' })
			if (sourceUuid) redirectMappings.push({ sourceUuid, target: existingRef })
			continue
		}

		// a level left out is not created, nor what it holds; the levels above the unit go with it
		if (level.context ? !unitWritten : leftOut?.has(sourceRef.id)) continue

		const parentTarget =
			(parentSourceId && frameIndex.get(parentSourceId)) || level.parentTarget || targetParent
		const target = await createStructural(tx, {
			sourceQuery,
			source: sourceRef,
			parentTarget,
			name: createName,
		})
		// a level placed where it was resolved is created under the name asked for, made free there
		if (params.placementLevels)
			await resolvePlacementCollision(tx, { ref: target, parentRef: parentTarget })
		frameIndex.set(sourceRef.id, target)
		createdIds.add(sourceRef.id)
		const sourceRecord = await sourceQuery.any.getRecord(sourceRef)
		if (sourceRecord) {
			cloneMappings.push({ source: sourceRecord as unknown as Scl.CloneMapping['source'], target })
		}
	}

	// 2. Merge OWN content (Private/BayType, equipment, connectivity) into the levels the source
	// gives content to, omitting the structural children (walked in step 1) and the delegated fn/app
	// children: a CREATED level receives it all; a level of the unit mapped onto an element of the
	// target receives what that element lacks — what it holds is left as it is. A context level is
	// the target's own structure and is left untouched.
	const ownContentOmit = omit ? [...FRAME_OWN_CONTENT_OMIT, ...omit] : FRAME_OWN_CONTENT_OMIT
	for (const { sourceRef } of levels) {
		if (!createdIds.has(sourceRef.id) && !mappedUnitIds.has(sourceRef.id)) continue
		const target = frameIndex.get(sourceRef.id)
		if (!target) continue
		const ownContent = await mergeChildrenInto(tx, {
			sourceQuery,
			source: sourceRef,
			target,
			omit: ownContentOmit,
			leftOut,
		})
		cloneMappings.push(...ownContent.cloneMappings)
		redirectMappings.push(...ownContent.redirectMappings)
	}

	const structure = await resolveFrameStructure(tx, sourceQuery, scopeRef, frameIndex)
	return { structure, frameIndex, cloneMappings, redirectMappings }
}

/**
 * Where each level lands when no placement was resolved: a level above the scope root is the one
 * `targetParent`'s own chain has, where it has one; every other level is created as the source
 * names it.
 */
async function reuseTargetAncestors(
	tx: Core.Transaction<Config>,
	params: Pick<EnsureTopologyFrameParams, 'sourceQuery' | 'scopeRef' | 'targetParent'>,
): Promise<PlacementLevel[]> {
	const { sourceQuery, scopeRef, targetParent } = params

	const frameElements = await collectFrameElements(sourceQuery, scopeRef)
	const ancestorIds = await strictAncestorIds(sourceQuery, scopeRef)
	const context = await resolveTargetAncestors(tx, targetParent)

	const levels: PlacementLevel[] = []
	for (const frameElement of frameElements) {
		const sourceId = frameElement.id
		if (!sourceId) continue
		const sourceRef = { ...frameElement, id: sourceId }

		const sourceAncestors = await sourceQuery.findAncestors(sourceRef, {
			stopAtTagName: 'Substation',
		})
		const parentLevel = sourceAncestors
			.map((ancestor) => levels.find((level) => level.sourceRef.id === ancestor.id))
			.find((level) => level !== undefined)

		const reused = ancestorIds.has(sourceId)
			? context[sourceRef.tagName as keyof TargetStructure]
			: undefined
		levels.push({
			sourceRef,
			parentSourceId: parentLevel?.sourceRef.id,
			context: ancestorIds.has(sourceId),
			undecided: false,
			resolved: {
				existing: reused as AnyTrackedRecord | undefined,
				reason: 'none',
				ambiguous: false,
				locked: false,
				undecided: false,
				projectOwned: reused !== undefined,
			},
		})
	}
	return levels
}

/** The ids of the scope root's STRICT structural ancestors (the reusable target context). */
export async function strictAncestorIds(
	sourceQuery: Core.Query<Config>,
	scopeRef: Scl.Ref<Scl.ElementsOf>,
): Promise<Set<string>> {
	const ancestors = await sourceQuery.findAncestors(scopeRef, { stopAtTagName: 'Substation' })
	const ids = new Set<string>()
	for (const ancestor of ancestors) {
		if (STRUCTURAL_TAGS.includes(ancestor.tagName) && ancestor.id && ancestor.id !== scopeRef.id) {
			ids.add(ancestor.id)
		}
	}
	return ids
}

/** The existing Substation/VoltageLevel/Bay levels on `targetParent`'s ancestry (inclusive). */
async function resolveTargetAncestors(
	tx: Core.Transaction<Config>,
	targetParent: Scl.Ref<Scl.ElementsOf>,
): Promise<TargetStructure> {
	const parent = await tx.getRecord(targetParent)
	if (!parent) return {}

	const ancestors = await tx.findAncestors(targetParent, { stopAtTagName: 'Substation' })
	const structure: TargetStructure = {}
	for (const record of [parent, ...ancestors]) {
		if (STRUCTURAL_TAGS.includes(record.tagName)) {
			structure[record.tagName as keyof TargetStructure] = record as never
		}
	}
	return structure
}

/**
 * The structural elements of the scope, ordered top-down: the scope's structural ancestors, the scope
 * root, then its structural descendants (outermost tag first, so a parent always precedes its child).
 */
export async function collectFrameElements(
	sourceQuery: Core.Query<Config>,
	scopeRef: Scl.Ref<Scl.ElementsOf>,
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const result: Scl.Ref<Scl.ElementsOf>[] = []

	const ancestors = await sourceQuery.findAncestors(scopeRef, { stopAtTagName: 'Substation' })
	const structuralAncestors = ancestors
		.filter((record) => STRUCTURAL_TAGS.includes(record.tagName) && record.id !== scopeRef.id)
		.reverse()
	for (const ancestor of structuralAncestors) {
		result.push({ tagName: ancestor.tagName, id: ancestor.id } as Scl.Ref<Scl.ElementsOf>)
	}

	result.push(scopeRef)

	for (const tag of TOPOLOGY_STRUCTURAL_TAGS) {
		for (const record of await sourceQuery.getRecordsByTagName(tag)) {
			if (record.id === scopeRef.id) continue
			if (result.some((ref) => ref.id === record.id)) continue
			const recordAncestors = await sourceQuery.findAncestors(
				{ tagName: tag, id: record.id } as Scl.Ref<Scl.ElementsOf>,
				{ stopAtTagName: 'Substation' },
			)
			if (recordAncestors.some((ancestor) => ancestor.id === scopeRef.id)) {
				result.push({ tagName: tag, id: record.id } as Scl.Ref<Scl.ElementsOf>)
			}
		}
	}

	return result
}

/**
 * Create a fresh target structural element from `source`, carrying its own attributes minus
 * identity (`uuid`/lineage). Always CREATES a distinct element (never reuse-matches an existing
 * sibling) so instantiating one typical twice under a parent yields two elements — the caller
 * then resolves the name collision (`B1` -> `B1_1`). The fresh `uuid` is minted by the enforce
 * hook; the identity finalization stamps/restores lineage from the clone mappings.
 */
async function createStructural(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		source: Scl.Ref<Scl.ElementsOf>
		parentTarget: Scl.Ref<Scl.ElementsOf>
		/** The name to create it under — its own when left out. */
		name?: string
	},
): Promise<Scl.Ref<Scl.ElementsOf>> {
	const { sourceQuery, source, parentTarget, name } = params

	// The record's own entries, not a value object: an attribute of a namespace the dialecte does not declare (a
	// diagram editor's esld:x) keeps the namespace only its entry carries.
	const record = await sourceQuery.any.getRecord(source)
	const cleanAttributes: AnyTrackedRecord['attributes'] = []
	for (const attribute of record?.attributes ?? []) {
		if (CREATE_STRIP_ATTRIBUTES.includes(attribute.name)) continue
		if (name && attribute.name === 'name') continue
		cleanAttributes.push(attribute)
	}
	if (name) cleanAttributes.push({ name: 'name', value: name })

	const created = await tx.any.addChild(parentTarget, {
		tagName: source.tagName,
		attributes: cleanAttributes,
	})
	return toRef(created) as Scl.Ref<Scl.ElementsOf>
}

/**
 * The structural chain (Substation/VL/Bay) of `ref` mapped to its reproduced target records, as a
 * `TargetStructure`. Lets a caller place fn/app content under the name-correct target level of `ref`,
 * even across multiple bays, using `resolveStructureRef` / `createAncestryResolver`.
 */
export async function resolveFrameStructure(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
	frameIndex: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>,
): Promise<TargetStructure> {
	const chain = [ref, ...(await sourceQuery.findAncestors(ref, { stopAtTagName: 'Substation' }))]
	const structure: TargetStructure = {}
	for (const source of chain) {
		if (!STRUCTURAL_TAGS.includes(source.tagName) || !source.id) continue
		const targetRef = frameIndex.get(source.id)
		if (!targetRef) continue
		const record = await tx.any.getRecord(targetRef)
		if (record) structure[source.tagName as keyof TargetStructure] = record as never
	}
	return structure
}
