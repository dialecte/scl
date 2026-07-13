import { cloneTree } from './clone-tree'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { DESCENDANTS } from '@/v2019C1/definition'

import type { Config, Scl } from '@/v2019C1/config'
import type { RefTagName, TargetOf } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Collects unique target refs from `refTagName` descendants inside `scopeRef`
 * that do not yet exist in the target transaction.
 *
 * Returns source-side refs ready to be cloned.
 */
export async function findMissingReferencedRecords<
	Ref extends RefTagName,
	Target extends TargetOf<Ref>,
>(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<Scl.AncestorsOf<Ref>>
		refTagName: Ref
		targetTagName: Target
		/**
		 * Source record ids already cloned earlier in this extraction (e.g. as part of
		 * a function subtree). Their clones carry remapped uuids, so the source-uuid
		 * existence check below cannot see them — skip by source id to avoid cloning
		 * a misplaced duplicate.
		 */
		alreadyCloned?: ReadonlySet<string>
	},
): Promise<Scl.Ref<Target>[]> {
	const { sourceQuery, scopeRef, refTagName, targetTagName, alreadyCloned } = params
	const uuidAttrName = UUID_REFERENCE_PAIRS[refTagName][0].attribute.uuid

	const result = await sourceQuery.findDescendants(scopeRef, {
		collect: refTagName,
	})
	const { [refTagName]: refs = [] } = result as { [K in Ref]: Scl.TrackedRecord<K>[] }

	const uuids = new Set<string>()
	for (const ref of refs) {
		const uuid = ref.attributes.find(
			(a: { name: string; value: string }) => a.name === uuidAttrName,
		)?.value
		if (uuid) uuids.add(uuid)
	}

	const missing: Scl.Ref<Target>[] = []
	for (const uuid of uuids) {
		const uuidFilter = { uuid } as Scl.AttributesValueObjectOf<Target>

		const [source] = await sourceQuery.findByAttributes({
			tagName: targetTagName,
			attributes: uuidFilter,
		})
		if (!source) continue
		if (alreadyCloned?.has(source.id)) continue

		const [existing] = await tx.findByAttributes({ tagName: targetTagName, attributes: uuidFilter })
		if (existing) continue

		missing.push({ tagName: targetTagName, id: source.id } as Scl.Ref<Target>)
	}

	return missing
}

/** Resolves the target parent each missing satellite is cloned under. */
export type ResolveTargetParent = (ref: Scl.Ref<Scl.ElementsOf>) => Promise<Scl.Ref<Scl.ElementsOf>>

/**
 * Generic satellite-clone helper.
 *
 * Scans `scopeRef` descendants for `refTagName` elements, collects unique uuid
 * values (derived from the UUID_REFERENCE_PAIRS constant), skips records
 * already present in the target, clones each missing one under the parent
 * returned by `resolveTargetParent` (mirroring the source hierarchy).
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 */
export async function cloneReferencedRecords<Ref extends RefTagName, Target extends TargetOf<Ref>>(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<Scl.AncestorsOf<Ref>>
		refTagName: Ref
		targetTagName: Target
		resolveTargetParent: ResolveTargetParent
		alreadyCloned?: ReadonlySet<string>
		omit?: OmitEntry<Config>[]
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		scopeRef,
		refTagName,
		targetTagName,
		resolveTargetParent,
		alreadyCloned,
		omit,
	} = params

	const missing = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef,
		refTagName,
		targetTagName,
		alreadyCloned,
	})

	const mappings: Scl.CloneMapping[] = []
	for (const ref of missing) {
		const targetParent = await resolveTargetParent(ref)
		const clone = await cloneTree(tx, { sourceQuery, ref, targetParent, omit })
		if (clone) mappings.push(...clone.mappings)
	}
	return mappings
}

// ── Config-driven bulk clone ─────────────────────────────────────────────────

// DESCENDANTS guarantees scopeRef is an ancestor of every derived refTagName.
// TypeScript cannot verify runtime-derived descendant constraints; cast once.
type CloneRefsFn = (
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<Scl.ElementsOf>
		refTagName: RefTagName
		targetTagName: Scl.ElementsOf
		resolveTargetParent: ResolveTargetParent
		alreadyCloned?: ReadonlySet<string>
		omit?: OmitEntry<Config>[]
	},
) => Promise<Scl.CloneMapping[]>

/**
 * Clones all referenced targets for ref types derived from
 * `DESCENDANTS[scopeTagName] ∩ UUID_REFERENCE_PAIRS`, skipping those in `skip`.
 *
 * Each missing target is cloned under the parent returned by `resolveTargetParent`,
 * which mirrors the source hierarchy so satellites that live under a `Function` are
 * not flattened to `Substation`.
 *
 * Targets already present in the target tx are skipped (dedup via findMissingReferencedRecords).
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 */
export async function cloneAllReferencedTargets(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeTagName: Scl.ElementsOf
		scopeRef: Scl.Ref<Scl.ElementsOf>
		resolveTargetParent: ResolveTargetParent
		alreadyCloned?: ReadonlySet<string>
		skip?: ReadonlySet<string>
		omit?: OmitEntry<Config>[]
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		scopeTagName,
		scopeRef,
		resolveTargetParent,
		alreadyCloned,
		skip = new Set(),
		omit,
	} = params

	const refTags = ((DESCENDANTS[scopeTagName] ?? []) as readonly string[]).filter(
		(tag): tag is RefTagName => tag in UUID_REFERENCE_PAIRS && !skip.has(tag),
	)

	const cloneRefs = cloneReferencedRecords as CloneRefsFn

	const mappings: Scl.CloneMapping[] = []
	for (const refTagName of refTags) {
		for (const pair of UUID_REFERENCE_PAIRS[refTagName]) {
			for (const targetTagName of pair.target) {
				const cloned = await cloneRefs(tx, {
					sourceQuery,
					scopeRef,
					refTagName,
					targetTagName: targetTagName as Scl.ElementsOf,
					resolveTargetParent,
					alreadyCloned,
					omit,
				})
				mappings.push(...cloned)
			}
		}
	}
	return mappings
}
