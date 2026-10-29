import { holdsOwnProvenance } from '@/v2019C1/extensions/reference/query/provenance/find-own-provenance'
import { PROVENANCE_ANCHOR_KIND_BY_TAG } from '@/v2019C1/extensions/reference/query/provenance/get-provenance.constants'
// read from their files: the query module of the extension holds the queries a document is asked
import { readAttribute } from '@/v2019C1/helpers'

import type { SsdExtractScope } from './extract.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { AppliedSatellite } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
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
 * wherever they sit (above a bay, for a bay's application), what applies to either from outside the scope, and what
 * the roles of its applications refer to. An
 * application recording a file of its own is another template's instance: it keeps its lineage, and so do the
 * functions it composes (they record no file of their own, the application's is theirs), wherever they sit — even when
 * an application of the scope composes them too.
 */
export async function readScopeInstanceContent(
	sourceQuery: Core.Query<Config>,
	params: {
		scopeRef: SsdExtractScope
		/** What applies to the scope or to what its applications compose, with what each applies to. */
		satellites: readonly AppliedSatellite[]
		/** What the roles of its applications refer to, by application (record id). */
		referencedBy: ReadonlyMap<string, readonly Scl.Ref<Scl.ElementsOf>[]>
	},
): Promise<Set<string>> {
	const { scopeRef } = params
	const tree = await sourceQuery.any.getTree(scopeRef)
	if (!tree) return new Set<string>()

	const ownedUuids = new Set<string>()
	const foreignUuids = new Set<string>()
	// what the roles of its own applications refer to came with it too (what a function the scope places holds is placed
	// with that function, and none of it)
	const referenced: Scl.Ref<Scl.ElementsOf>[] = []
	for (const application of collectTagged({ node: tree, tagName: 'Application' })) {
		const foreign = holdsOwnProvenance({ tree: application })
		const referredTo = params.referencedBy.get(application.id)
		if (!foreign && referredTo) referenced.push(...referredTo)
		const composed = foreign ? foreignUuids : ownedUuids
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
	// what applies to that content from outside it (a variable, a behaviour description, as the extract resolved them)
	// came with it too; what applies to another instance's elements only did not
	const satellites = params.satellites
		.filter(function appliesToContent(satellite) {
			return satellite.targetIds.some(function isContent(targetId) {
				return content.has(targetId)
			})
		})
		.map(function satelliteOf(satellite) {
			return satellite.satelliteRef
		})
	const satelliteContent = await readInstanceContent(sourceQuery, {
		roots: [...satellites, ...referenced],
	})
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
