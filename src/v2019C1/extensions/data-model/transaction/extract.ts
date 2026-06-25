import { resolve } from '../query'

import { applyTypeIdRemap } from '@/v2019C1/extensions/reference/transaction'
import { elementSignature } from '@/v2019C1/extensions/signature/query'

import type { ResolvedDataModel } from '../query/resolve.types'
import type {
	ExtractParams,
	ExtractResult,
	ExtractStats,
	ForkIdContext,
	TypeRecord,
} from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type { ExtractParams, ExtractResult, ExtractStats, ForkIdContext } from './extract.types'

/**
 * Import the type closure of `records` into the target `DataTypeTemplates`,
 * content-addressed (§6.9):
 *
 * - **R1** structurally-equal type already in the target → reuse its id (dedup);
 * - **R2** no match and the source id is free → clone, preserving the id;
 * - **R3** no match but the id is taken by different content → fork under a new
 *   id (`forkId`, default content hash) and propagate the fork upward.
 *
 * Child type references inside the imported types — and the `lnType` of the
 * instances in `cloneMappings` (the caller's instance clone) — are repointed to
 * the reconciled ids in the same transaction. With an empty / non-colliding
 * target and no `cloneMappings` this is byte-identical to a plain id-preserving
 * clone.
 */
export async function extract(
	tx: Core.Transaction<Config>,
	params: ExtractParams,
): Promise<ExtractResult> {
	const { sourceQuery, records, cloneMappings = [], forkId = defaultForkId } = params

	const resolved = await resolve(sourceQuery, { records })
	const sourceTypes = collectTypesBottomUp(resolved)

	const dataTypeTemplates = await tx.ensureChild(await tx.getRoot(), {
		tagName: 'DataTypeTemplates',
		attributes: {},
	})

	// Dedup only against the types that already existed in the target (never
	// against types we mint during this run).
	const preExisting = await buildPreExistingSignatureIndex(tx)

	const idRemap = new Map<string, string>()
	const clonedRoots: Scl.Ref<Scl.ElementsOf>[] = []
	const stats: ExtractStats = { reused: 0, preserved: 0, forked: 0 }

	for (const source of sourceTypes) {
		const sourceId = await sourceQuery.getAttribute(source, { name: 'id' })
		if (!sourceId) continue

		const signature = await elementSignature(sourceQuery, {
			ref: { tagName: source.tagName, id: source.id },
			resolveReferences: true,
		})

		const reusedId = preExisting.get(signature)
		if (reusedId !== undefined) {
			idRemap.set(sourceId, reusedId)
			stats.reused++
			continue
		}

		const tree = await sourceQuery.getTree(source)
		if (!tree) continue

		const idTaken =
			(await tx.findByAttributes({ tagName: source.tagName, attributes: { id: sourceId } }))
				.length > 0

		let targetId = sourceId
		let preparedTree = tree
		if (idTaken) {
			targetId = forkId({ tagName: source.tagName, baseName: sourceId, signature })
			preparedTree = withRootId(tree, targetId)
			stats.forked++
		} else {
			stats.preserved++
		}

		const clone = await tx.deepClone(dataTypeTemplates, preparedTree)
		idRemap.set(sourceId, targetId)
		if (clone?.record) clonedRoots.push(toRef(clone.record.tagName, clone.record.id))
	}

	// Second pass: now that idRemap is complete, repoint the child type-refs of
	// every cloned type and the `lnType` of the cloned instances (clone mappings).
	const recordsToRemap: Scl.Ref<Scl.ElementsOf>[] = cloneMappings.map((mapping) => mapping.target)
	for (const root of clonedRoots) {
		const tree = await tx.getTree(root)
		if (tree) collectRefs(tree, recordsToRemap)
	}
	await applyTypeIdRemap(tx, { records: recordsToRemap, idRemap })

	return { idRemap, stats }
}

// ── Internals ───────────────────────────────────────────────────────────────────

/** Bottom-up so a type's children are reconciled before the parent references them. */
function collectTypesBottomUp(resolved: ResolvedDataModel): TypeRecord[] {
	return [...resolved.enumTypes, ...resolved.daTypes, ...resolved.doTypes, ...resolved.lnodeTypes]
}

const TYPE_TAGS = ['EnumType', 'DAType', 'DOType', 'LNodeType'] as const

/** signature -> id of the types already present in the target, first occurrence wins. */
async function buildPreExistingSignatureIndex(
	tx: Core.Transaction<Config>,
): Promise<Map<string, string>> {
	const index = new Map<string, string>()
	for (const tagName of TYPE_TAGS) {
		const existing = await tx.getRecordsByTagName(tagName)
		for (const record of existing) {
			const id = record.attributes.find((a) => a.name === 'id')?.value
			if (!id) continue
			const signature = await elementSignature(tx, {
				ref: { tagName, id: record.id },
				resolveReferences: true,
			})
			if (!index.has(signature)) index.set(signature, id)
		}
	}
	return index
}

function withRootId<GenericElement extends Scl.ElementsOf>(
	tree: Scl.TreeRecord<GenericElement>,
	newId: string,
): Scl.TreeRecord<GenericElement> {
	const clone = structuredClone(tree)
	const attributes = clone.attributes as { name: string; value: string }[]
	const idAttribute = attributes.find((a) => a.name === 'id')
	if (idAttribute) idAttribute.value = newId
	else attributes.push({ name: 'id', value: newId })
	return clone
}

/** Build a ref from a dynamic tag name (the per-tag Ref union needs the assertion). */
function toRef(tagName: string, id: string): Scl.Ref<Scl.ElementsOf> {
	return { tagName, id } as unknown as Scl.Ref<Scl.ElementsOf>
}

function collectRefs(node: Scl.TreeRecord<Scl.ElementsOf>, out: Scl.Ref<Scl.ElementsOf>[]): void {
	out.push(toRef(node.tagName, node.id))
	for (const child of node.tree ?? []) collectRefs(child, out)
}

/** Deterministic content-hash fork id: `<baseName>_<shortHash(signature)>`. */
export function defaultForkId(ctx: ForkIdContext): string {
	return `${ctx.baseName}_${shortHash(ctx.signature)}`
}

/** FNV-1a 32-bit, hex. Stable across runs for a given signature. */
function shortHash(input: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, '0')
}
