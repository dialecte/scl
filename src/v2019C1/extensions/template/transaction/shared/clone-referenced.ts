import { cloneTreeWithRemap } from './clone-utils'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { DESCENDANTS } from '@/v2019C1/definition'

import type { Config, Scl } from '@/v2019C1/config'
import type { DescendantsFilter, ExcludeFilter } from '@dialecte/core'

// ── Type helpers ──────────────────────────────────────────────────────────────

/** All SCL elements that are valid ref tag names (have uuid reference pairs). */
type RefTagName = keyof typeof UUID_REFERENCE_PAIRS & Scl.ElementsOf

/** Valid target tag names for a given ref tag, narrowed to known SCL elements. */
type TargetOf<Ref extends keyof typeof UUID_REFERENCE_PAIRS> =
	(typeof UUID_REFERENCE_PAIRS)[Ref][number]['target'][number] & Scl.ElementsOf

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
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		scopeRef: Scl.Ref<Scl.AncestorsOf<Ref>>
		refTagName: Ref
		targetTagName: Target
	},
): Promise<Scl.Ref<Target>[]> {
	const { sourceQuery, scopeRef, refTagName, targetTagName } = params
	const uuidAttrName = UUID_REFERENCE_PAIRS[refTagName][0].attribute.uuid

	const result = await sourceQuery.findDescendants(scopeRef, {
		tagName: refTagName,
	} as DescendantsFilter<Config>)
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
		const [existing] = await tx.findByAttributes({ tagName: targetTagName, attributes: uuidFilter })
		if (existing) continue

		const [source] = await sourceQuery.findByAttributes({
			tagName: targetTagName,
			attributes: uuidFilter,
		})
		if (!source) continue

		missing.push({ tagName: targetTagName, id: source.id } as Scl.Ref<Target>)
	}

	return missing
}

/**
 * Generic satellite-clone helper.
 *
 * Scans `scopeRef` descendants for `refTagName` elements, collects unique uuid
 * values (derived from the UUID_REFERENCE_PAIRS constant), skips records
 * already present in the target, clones each missing one into `targetParent`,
 * and returns the accumulated sourceUuid -> targetUuid remap.
 */
export async function cloneReferencedRecords<Ref extends RefTagName, Target extends TargetOf<Ref>>(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		scopeRef: Scl.Ref<Scl.AncestorsOf<Ref>>
		refTagName: Ref
		targetTagName: Target
		targetParent: Scl.Ref<Scl.ElementsOf>
		exclude?: ExcludeFilter<Config>[]
	},
): Promise<Map<string, string>> {
	const { sourceQuery, scopeRef, refTagName, targetTagName, targetParent, exclude } = params

	const missing = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef,
		refTagName,
		targetTagName,
	})

	const accRemap = new Map<string, string>()
	for (const ref of missing) {
		const remap = await cloneTreeWithRemap(tx, { sourceQuery, ref, targetParent, exclude })
		for (const [key, value] of remap) accRemap.set(key, value)
	}

	return accRemap
}

// ── Config-driven bulk clone ─────────────────────────────────────────────────

// DESCENDANTS guarantees scopeRef is an ancestor of every derived refTagName.
// TypeScript cannot verify runtime-derived descendant constraints; cast once.
type CloneRefsFn = (
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		scopeRef: Scl.Ref<Scl.ElementsOf>
		refTagName: RefTagName
		targetTagName: Scl.ElementsOf
		targetParent: Scl.Ref<Scl.ElementsOf>
		exclude?: ExcludeFilter<Config>[]
	},
) => Promise<Map<string, string>>

/**
 * Clones all referenced targets for ref types derived from
 * `DESCENDANTS[scopeTagName] ∩ UUID_REFERENCE_PAIRS`, skipping those in `skip`.
 *
 * Targets already present in the target tx are skipped (dedup via findMissingReferencedRecords).
 */
export async function cloneAllReferencedTargets(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		scopeTagName: Scl.ElementsOf
		scopeRef: Scl.Ref<Scl.ElementsOf>
		targetParent: Scl.Ref<Scl.ElementsOf>
		skip?: ReadonlySet<string>
		exclude?: ExcludeFilter<Config>[]
	},
): Promise<Map<string, string>> {
	const { sourceQuery, scopeTagName, scopeRef, targetParent, skip = new Set(), exclude } = params
	const remap = new Map<string, string>()

	const refTags = (DESCENDANTS[scopeTagName] as readonly string[]).filter(
		(tag): tag is RefTagName => tag in UUID_REFERENCE_PAIRS && !skip.has(tag),
	)

	const cloneRefs = cloneReferencedRecords as CloneRefsFn

	for (const refTagName of refTags) {
		for (const pair of UUID_REFERENCE_PAIRS[refTagName]) {
			for (const targetTagName of pair.target) {
				const partial = await cloneRefs(tx, {
					sourceQuery,
					scopeRef,
					refTagName,
					targetTagName: targetTagName as Scl.ElementsOf,
					targetParent,
					exclude,
				})
				for (const [k, v] of partial) remap.set(k, v)
			}
		}
	}

	return remap
}
