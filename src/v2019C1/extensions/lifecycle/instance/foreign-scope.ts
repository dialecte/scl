import { findInstancesByTemplateUuid } from './find-instance'
import { collectInstanceScope } from './instance-scope'

import { REFERENCE_TAG_NAMES, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type {
	CollectForeignReferenceIdsParams,
	CollectForeignScopesParams,
	ForeignScopeResolverParams,
	ForeignScopes,
	ResolveForeignScope,
} from './foreign-scope.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A reader with the untyped `.any` facade — either a Query or a Transaction. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * What belongs to the other instances of a template, for each of its instances: the elements the
 * others hold or refer to, less those the instance holds or refers to itself (an element they
 * share is nobody's alone). Empty for a template the project holds one instance of.
 */
export async function collectForeignScopes(
	reader: Reader,
	params: CollectForeignScopesParams,
): Promise<ForeignScopes> {
	const { instances } = params

	const foreignScopes = new Map<string, Set<string>>()
	if (instances.length < 2) return foreignScopes

	const instanceScopes = new Map<string, ReadonlySet<string>>()
	for (const instance of instances) {
		const instanceScope = await collectInstanceScope(reader, instance)
		instanceScopes.set(instance.id, instanceScope)
	}

	for (const [instanceId, instanceScope] of instanceScopes) {
		const foreignScope = new Set<string>()
		for (const [otherId, otherScope] of instanceScopes) {
			if (otherId === instanceId) continue
			for (const recordId of otherScope) {
				if (!instanceScope.has(recordId)) foreignScope.add(recordId)
			}
		}
		foreignScopes.set(instanceId, foreignScope)
	}
	return foreignScopes
}

/**
 * What belongs to the other instances of the template one instance was made from, found among
 * every instance of that template the project holds. Resolved when first asked for, once.
 */
export function foreignScopeResolver(
	reader: Reader,
	params: ForeignScopeResolverParams,
): ResolveForeignScope {
	const { instanceRootRef, sourceUuid, matchKey } = params

	let foreignScope: Promise<ReadonlySet<string>> | undefined
	async function resolveForeignScope(): Promise<ReadonlySet<string>> {
		const instances = await findInstancesByTemplateUuid(reader, {
			tagName: instanceRootRef.tagName as Scl.ElementsOf,
			sourceUuid,
			matchKey,
		})
		const foreignScopes = await collectForeignScopes(reader, { instances })
		return foreignScopes.get(instanceRootRef.id ?? '') ?? new Set()
	}

	return function () {
		foreignScope ??= resolveForeignScope()
		return foreignScope
	}
}

/**
 * The references a shared element holds for the OTHER instances of a template: those pointing at
 * what belongs to another instance, and those already known to be another instance's. Each
 * instance gives a shared element its own references; another instance's is never the counterpart
 * of one of this instance's.
 */
export async function collectForeignReferenceIds(
	reader: Reader,
	params: CollectForeignReferenceIdsParams,
): Promise<Set<string>> {
	const { sharedRootRef, foreignScope } = params

	const foreignReferenceIds = new Set<string>()
	if (foreignScope.size === 0) return foreignReferenceIds

	const sharedTree = await reader.any.getTree(sharedRootRef)
	if (sharedTree) {
		await collectForeignReferences(reader, { node: sharedTree, foreignScope, foreignReferenceIds })
	}
	return foreignReferenceIds
}

async function collectForeignReferences(
	reader: Reader,
	params: {
		node: AnyTreeRecord
		foreignScope: ReadonlySet<string>
		foreignReferenceIds: Set<string>
	},
): Promise<void> {
	const { node, foreignScope, foreignReferenceIds } = params

	for (const child of node.tree) {
		if (!REFERENCE_TAG_NAMES.has(child.tagName)) {
			await collectForeignReferences(reader, { node: child, foreignScope, foreignReferenceIds })
			continue
		}
		const isForeign =
			foreignScope.has(child.id) ||
			(await pointsInto(reader, { reference: child, scope: foreignScope }))
		if (isForeign) foreignReferenceIds.add(child.id)
	}
}

/** Whether a reference points at an element of a scope. */
export async function pointsInto(
	reader: Reader,
	params: { reference: AnyTreeRecord; scope: ReadonlySet<string> },
): Promise<boolean> {
	const { reference, scope } = params

	const pairs = UUID_REFERENCE_PAIRS[reference.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
	for (const pair of pairs) {
		const referencedUuid = await reader.any.getAttribute(reference, { name: pair.attribute.uuid })
		if (!referencedUuid) continue
		for (const tagName of pair.target) {
			const referenced = await reader.any.findByAttributes({
				tagName: tagName as Scl.ElementsOf,
				attributes: { uuid: referencedUuid },
			})
			if (referenced.some((record) => scope.has(record.id))) return true
		}
	}
	return false
}
