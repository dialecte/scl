import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { holdsOwnProvenance } from '@/v2019C1/extensions/reference/query/provenance/find-own-provenance'
import { PROVENANCE_ANCHOR_KIND_BY_TAG } from '@/v2019C1/extensions/reference/query/provenance/get-provenance.constants'
// read from their files: the query module of the extension holds the queries a document is asked
import { readAttribute } from '@/v2019C1/helpers'

import type { SsdExtractScope } from './extract.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The source elements that came with the instance of the elements extracted, by record id: what breaking their
 * template link reaches. Each root and everything below it, but an element recording a source file of its own — a
 * subfunction placed from another FSD, an application or a function placed from its file — with what it holds: that
 * is the instance of another template; and but the `foreignIds` (another instance's elements found elsewhere). A
 * companion (a function the application extracted composes) counts as the root's content unless it records a file of
 * its own.
 */
export async function readInstanceContent(
	sourceQuery: Core.Query<Config>,
	params: {
		roots: readonly AnyRefOrRecord[]
		companions?: readonly AnyRefOrRecord[]
		foreignIds?: ReadonlySet<string>
	},
): Promise<Set<string>> {
	const { roots, companions = [], foreignIds = new Set<string>() } = params
	const content = new Set<string>()
	for (const root of roots) {
		const tree = await sourceQuery.any.getTree(root)
		if (tree) collectInstanceContent({ node: tree, content, foreignIds })
	}
	for (const companion of companions) {
		// a companion the roots hold is read already
		const known =
			companion.id !== undefined && (content.has(companion.id) || foreignIds.has(companion.id))
		if (known) continue
		const tree = await sourceQuery.any.getTree(companion)
		if (tree && !holdsOwnProvenance({ tree }))
			collectInstanceContent({ node: tree, content, foreignIds })
	}
	return content
}

/**
 * What came with the instance of an SSD scope: the scope and what it holds, the functions its applications compose
 * wherever they sit (above a bay, for a bay's application), and what applies to the scope from outside it. An
 * application recording a file of its own is another template's instance: it keeps its lineage, and so do the
 * functions it composes (they record no file of their own, the application's is theirs), wherever they sit — even when
 * an application of the scope composes them too.
 */
export async function readScopeInstanceContent(
	sourceQuery: Core.Query<Config>,
	params: { scopeRef: SsdExtractScope },
): Promise<Set<string>> {
	const { scopeRef } = params
	const tree = await sourceQuery.any.getTree(scopeRef)
	if (!tree) return new Set<string>()

	const ownedUuids = new Set<string>()
	const foreignUuids = new Set<string>()
	for (const application of collectTagged({ node: tree, tagName: 'Application' })) {
		const composed = holdsOwnProvenance({ tree: application }) ? foreignUuids : ownedUuids
		for (const functionRef of collectTagged({ node: application, tagName: 'FunctionRef' })) {
			const functionUuid = readAttribute({
				record: functionRef,
				name: 'functionUuid',
				defaults: 'none',
			})
			if (functionUuid) composed.add(functionUuid)
		}
	}

	const foreignIds = new Set<string>()
	for (const foreign of await findFunctionsByUuid(sourceQuery, { uuids: foreignUuids })) {
		const foreignTree = await sourceQuery.any.getTree(foreign)
		if (foreignTree) collectIds({ node: foreignTree, ids: foreignIds })
	}
	const companionUuids = [...ownedUuids].filter((uuid) => !foreignUuids.has(uuid))
	const companions = await findFunctionsByUuid(sourceQuery, { uuids: companionUuids })
	const content = await readInstanceContent(sourceQuery, {
		roots: [scopeRef],
		companions,
		foreignIds,
	})
	// what applies to that content from outside the scope (a variable, a behaviour description) came with it too; what
	// applies to another instance's elements only did not
	const scopeIds = new Set<string>()
	collectIds({ node: tree, ids: scopeIds })
	const otherInstances = new Set(
		[...scopeIds].filter(function isOtherInstance(scopeId) {
			return !content.has(scopeId)
		}),
	)
	const satellites = await resolveAppliedSatellites(sourceQuery, {
		primaryRef: scopeRef,
		leftOut: otherInstances,
	})
	const satelliteContent = await readInstanceContent(sourceQuery, { roots: satellites })
	return new Set([...content, ...satelliteContent])
}

function collectInstanceContent(params: {
	node: AnyTreeRecord
	content: Set<string>
	foreignIds: ReadonlySet<string>
}): void {
	const { node, content, foreignIds } = params
	content.add(node.id)
	for (const child of node.tree) {
		if (foreignIds.has(child.id)) continue
		const anchorsProvenance = child.tagName in PROVENANCE_ANCHOR_KIND_BY_TAG
		if (anchorsProvenance && holdsOwnProvenance({ tree: child })) continue
		collectInstanceContent({ node: child, content, foreignIds })
	}
}

/** The source functions carrying the uuids given, each read once. */
async function findFunctionsByUuid(
	sourceQuery: Core.Query<Config>,
	params: { uuids: Iterable<string> },
): Promise<AnyRefOrRecord[]> {
	const found: AnyRefOrRecord[] = []
	for (const uuid of new Set(params.uuids)) {
		const [record] = await sourceQuery.any.findByAttributes({
			tagName: 'Function',
			attributes: { uuid },
		})
		if (record) found.push(record)
	}
	return found
}

/** The elements of a tag in a tree, its root included. */
function collectTagged(params: { node: AnyTreeRecord; tagName: string }): AnyTreeRecord[] {
	const { node, tagName } = params
	const below = node.tree.flatMap((child) => collectTagged({ node: child, tagName }))
	return node.tagName === tagName ? [node, ...below] : below
}

/** The record ids of a tree. */
function collectIds(params: { node: AnyTreeRecord; ids: Set<string> }): void {
	const { node, ids } = params
	ids.add(node.id)
	for (const child of node.tree) collectIds({ node: child, ids })
}
