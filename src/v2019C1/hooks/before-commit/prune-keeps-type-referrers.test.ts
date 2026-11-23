import { describe, expect, it } from 'vitest'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAGS } from '@/v2019C1/constants'
import { CHILDREN, DESCENDANTS, ROOT_ELEMENT } from '@/v2019C1/definition/constants.generated'
import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'
import {
	IDENTIFIED_TAGS,
	PRUNED_WHEN_EMPTY_TAGS,
} from '@/v2019C1/helpers/pruned-when-empty.constants'
import { TUPLE_ORPHAN_TAGS } from '@/v2019C1/hooks/before-delete/orphaned-refs.constants'

/** The tags that name a data type by an id attribute: what makes a type used. */
const TYPE_ID_REFERRER_TAGS: ReadonlySet<string> = new Set(Object.keys(TYPE_ID_REFERENCE_PAIRS))

/** The children the definition places directly under a tag. */
function childrenOf(tagName: string): readonly string[] {
	return (CHILDREN as Readonly<Record<string, readonly string[]>>)[tagName] ?? []
}

/** A tag and everything the definition places below it. */
function tagWithDescendants(tagName: string): readonly string[] {
	const below = (DESCENDANTS as Readonly<Record<string, readonly string[]>>)[tagName] ?? []
	return [tagName, ...below]
}

// The commit prunes the containers before the types, so the type prune reads what their cascade left. That is only
// safe while a prune can never take a type referrer with it - otherwise a container going would make a type look
// unused and the commit would delete a type the document still names. Both halves of that are properties of the
// definition and the registries, so they are checked there rather than on one document: a fixture can only show the
// cases someone thought of.
describe('the commit prune can never make a data type unused by itself', () => {
	// `emptiedRule` gives up as soon as a container keeps a child with an identity of its own, so a container holding
	// a type referrer is never pruned, whatever else it lost.
	it('never prunes a container keeping a type referrer: every referrer tag has an identity of its own', () => {
		const withoutIdentity = [...TYPE_ID_REFERRER_TAGS].filter(
			(tagName) => !IDENTIFIED_TAGS.has(tagName),
		)
		expect(withoutIdentity).toEqual([])
	})

	// A container pruned by `lost-required` takes the children it still holds with it, and their subtrees with them
	// (the cascade's `within`). Those staying children are all unidentified - `emptiedRule` gives up on an identified
	// one - so it is the unidentified children of a prunable container, read a whole subtree deep, that must hold no
	// type referrer. The `holds-nothing` rule needs no case of its own: it fires only when every child is gone
	// already, so it takes nothing the operations do not already carry. The document root is left out: `emptiedRule`
	// gives up on a record with no parent, so the root is never pruned and what it holds is never swept with it.
	it('takes no type referrer with a pruned container: no unidentified child of one reaches a referrer', () => {
		const reachingAReferrer = [...PRUNED_WHEN_EMPTY_TAGS]
			.filter((container) => container !== ROOT_ELEMENT)
			.flatMap((container) =>
				childrenOf(container)
					.filter((child) => !IDENTIFIED_TAGS.has(child))
					.flatMap((child) =>
						tagWithDescendants(child)
							.filter((below) => TYPE_ID_REFERRER_TAGS.has(below))
							.map((below) => `${container} keeps ${child}, which holds ${below}`),
					),
			)
			.sort()
		expect(reachingAReferrer).toEqual([])
	})

	// The other way a prune removes something is the cascade: a reference naming what goes, deleted with what it
	// holds. None of those reaches a type referrer, so none takes a `lnType` or a `type` with it. The tuple referrers
	// are taken whole (`TUPLE_ORPHAN_TAGS`): `tupleOrphanOf` deletes one outside `DELETED_TUPLE_REFERRER_TAGS` too,
	// when it holds nothing of its own.
	it('deletes no reference that holds a type referrer: no orphan-deleted tag reaches one', () => {
		const deletedOnOrphan = [
			...REFERENCE_TAGS.filter((tagName) => !KEEP_ON_ORPHAN_REFS.has(tagName)),
			...TUPLE_ORPHAN_TAGS,
		]
		const reachingAReferrer = deletedOnOrphan
			.flatMap((tagName) =>
				tagWithDescendants(tagName)
					.filter((below) => TYPE_ID_REFERRER_TAGS.has(below))
					.map((below) => `${tagName} holds ${below}`),
			)
			.sort()
		expect(reachingAReferrer).toEqual([])
	})
})
