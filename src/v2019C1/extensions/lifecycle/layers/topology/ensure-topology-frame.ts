import { mergeChildrenInto } from '../../transplant/transaction/primitives/merge-children-into'

import { toRef } from '@dialecte/core/helpers'

import { FRAME_OMIT_CHILD_TAGS, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

import type {
	EnsureTopologyFrameParams,
	EnsureTopologyFrameResult,
} from './ensure-topology-frame.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

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
 * equipment, connectivity). Ancestors ABOVE the scope root are the target CONTEXT: reused from
 * `targetParent`'s existing chain where present, created from source where absent (so an empty target
 * gets the whole chain). The scope root and its structural DESCENDANTS are always CREATED from source
 * with their own content, OMITTING the delegated fn/app children (the fn/app layers place those), and
 * stamped by the caller so a later update can match them by `templateUuid`.
 *
 * Returns a `frameIndex` (source structural id -> target ref) so callers place fn/app content under
 * the correct target level even across multiple bays.
 */
export async function ensureTopologyFrame(
	tx: Core.Transaction<Config>,
	params: EnsureTopologyFrameParams,
): Promise<EnsureTopologyFrameResult> {
	const { sourceQuery, scopeRef, targetParent, omit } = params

	const frameElements = await collectFrameElements(sourceQuery, scopeRef)
	const ancestorIds = await strictAncestorIds(sourceQuery, scopeRef)
	const context = await resolveTargetAncestors(tx, targetParent)

	const frameIndex = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	const createdIds = new Set<string>()
	const mappings: Scl.CloneMapping[] = []

	// 1. Resolve each structural level: reuse an ancestor the target already provides, else create.
	for (const source of frameElements) {
		if (!source.id) continue

		const reused = ancestorIds.has(source.id) && context[source.tagName as keyof TargetStructure]
		if (reused) {
			frameIndex.set(source.id, toRef(reused) as Scl.Ref<Scl.ElementsOf>)
			continue
		}

		const parentTarget = await resolveParentTarget(sourceQuery, source, frameIndex, targetParent)
		const target = await createStructural(tx, { sourceQuery, source, parentTarget })
		frameIndex.set(source.id, target)
		createdIds.add(source.id)
		const sourceRecord = await sourceQuery.any.getRecord(source)
		if (sourceRecord) {
			mappings.push({ source: sourceRecord as unknown as Scl.CloneMapping['source'], target })
		}
	}

	// 2. Merge OWN content (Private/BayType, equipment, connectivity) into the CREATED levels only,
	// omitting the structural children (walked in step 1) and the delegated fn/app children. Reused
	// ancestor levels are the target's own structure and are left untouched.
	const ownContentOmit = omit ? [...FRAME_OWN_CONTENT_OMIT, ...omit] : FRAME_OWN_CONTENT_OMIT
	for (const source of frameElements) {
		if (!source.id || !createdIds.has(source.id)) continue
		const target = frameIndex.get(source.id)
		if (!target) continue
		const ownContent = await mergeChildrenInto(tx, {
			sourceQuery,
			source,
			target,
			omit: ownContentOmit,
		})
		mappings.push(...ownContent)
	}

	const structure = await resolveFrameStructure(tx, sourceQuery, scopeRef, frameIndex)
	return { structure, frameIndex, mappings }
}

/** The ids of the scope root's STRICT structural ancestors (the reusable target context). */
async function strictAncestorIds(
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
async function collectFrameElements(
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

/** The reproduced target ref of `source`'s nearest structural ancestor, else `targetParent`. */
async function resolveParentTarget(
	sourceQuery: Core.Query<Config>,
	source: Scl.Ref<Scl.ElementsOf>,
	frameIndex: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>,
	targetParent: Scl.Ref<Scl.ElementsOf>,
): Promise<Scl.Ref<Scl.ElementsOf>> {
	const ancestors = await sourceQuery.findAncestors(source, { stopAtTagName: 'Substation' })
	for (const ancestor of ancestors) {
		const target = ancestor.id ? frameIndex.get(ancestor.id) : undefined
		if (target) return target
	}
	return targetParent
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
	},
): Promise<Scl.Ref<Scl.ElementsOf>> {
	const { sourceQuery, source, parentTarget } = params

	const attributes = await sourceQuery.any.getAttributes(source)
	const cleanAttributes: Record<string, string> = {}
	for (const [key, value] of Object.entries(attributes)) {
		if (!CREATE_STRIP_ATTRIBUTES.includes(key)) cleanAttributes[key] = value
	}

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
