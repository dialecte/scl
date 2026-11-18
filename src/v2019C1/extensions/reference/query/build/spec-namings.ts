import { toRawRecord } from '@dialecte/core/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The `LNodeSpecNaming` of each LNode among `records`, by LNode id, directly under it or in one of
 * its Privates. Two reads whatever the number of LNodes: their Privates, then the namings; a Private or naming
 * among `held` (records already read, by id), or a Private of a held LNode whose children are held (a subtree read
 * skips the Private wrapper itself), is not read again, so none when every one is held.
 */
export async function readSpecNamingsById(
	query: Core.Query<Config>,
	params: {
		records: readonly Pick<Core.AnyRawRecord, 'id' | 'tagName' | 'children'>[]
		held?: ReadonlyMap<string, Core.AnyRawRecord>
	},
): Promise<Map<string, Core.AnyRawRecord>> {
	const { held } = params
	const lnodeOf = new Map<string, string>()
	const namingRefs: { id: string; tagName: string }[] = []
	const privateRefs: { id: string; tagName: string }[] = []

	for (const record of params.records) {
		if (record.tagName !== 'LNode') continue
		for (const child of record.children) {
			if (child.tagName === 'LNodeSpecNaming') namingRefs.push(child)
			else if (child.tagName === 'Private') privateRefs.push(child)
			else continue
			lnodeOf.set(child.id, record.id)
		}
	}

	const heldChildren = childrenHeld({ held })
	// a Private's held children are all of them only when its LNode was read with them (the same subtree)
	function childrenHeldOf(privateRef: {
		id: string
	}): { id: string; tagName: string }[] | undefined {
		return held?.has(lnodeOf.get(privateRef.id) ?? '') ? heldChildren.get(privateRef.id) : undefined
	}
	const privates = await readUnheld(query, {
		refs: privateRefs.filter((ref) => !childrenHeldOf(ref)),
		held,
	})
	const privateChildren = [
		...privateRefs.flatMap((ref) => {
			const children = childrenHeldOf(ref)
			return children ? [{ id: ref.id, children }] : []
		}),
		...privates.flatMap((privateRecord) => (privateRecord ? [privateRecord] : [])),
	]
	for (const privateRecord of privateChildren) {
		for (const child of privateRecord.children) {
			if (child.tagName !== 'LNodeSpecNaming') continue
			namingRefs.push(child)
			lnodeOf.set(child.id, lnodeOf.get(privateRecord.id) ?? '')
		}
	}

	const namings = await readUnheld(query, { refs: namingRefs, held })
	const byLNode = new Map<string, Core.AnyRawRecord>()
	for (const naming of namings) {
		const lnodeId = naming ? lnodeOf.get(naming.id) : undefined
		if (naming && lnodeId && !byLNode.has(lnodeId)) byLNode.set(lnodeId, toRawRecord(naming))
	}
	return byLNode
}

/** The refs of the records `held` below each parent, by parent id. */
function childrenHeld(params: {
	held: ReadonlyMap<string, Core.AnyRawRecord> | undefined
}): Map<string, { id: string; tagName: string }[]> {
	const byParent = new Map<string, { id: string; tagName: string }[]>()
	for (const record of params.held?.values() ?? []) {
		const parentId = record.parent?.id
		if (!parentId) continue
		const child = { id: record.id, tagName: record.tagName }
		const children = byParent.get(parentId)
		if (children) children.push(child)
		else byParent.set(parentId, [child])
	}
	return byParent
}

/** The records of `refs`: those `held` as held, the others in one read (none when every one is held). */
async function readUnheld(
	query: Core.Query<Config>,
	params: {
		refs: readonly { id: string; tagName: string }[]
		held: ReadonlyMap<string, Core.AnyRawRecord> | undefined
	},
): Promise<(Core.AnyRawRecord | Core.AnyTrackedRecord | undefined)[]> {
	const { refs, held } = params
	const unheld = refs.filter((ref) => !held?.has(ref.id))
	const read = unheld.length > 0 ? await query.getRecords(asRefs(unheld)) : []
	const readById = new Map(
		read.flatMap((record): [string, Core.AnyTrackedRecord][] =>
			record ? [[record.id, record]] : [],
		),
	)
	return refs.map((ref) => held?.get(ref.id) ?? readById.get(ref.id))
}

function asRefs(refs: readonly { id: string; tagName: string }[]): Scl.Ref<Scl.ElementsOf>[] {
	return refs as Scl.Ref<Scl.ElementsOf>[]
}
