import type { ReadSpecNamingsParams, ReadSpecNamingsResult } from './read-spec-namings.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The `LNodeSpecNaming` of each LNode given, directly under it or in one of its Privates, one entry per input in
 * input order: `undefined` for an LNode without one, or for a ref that names no element. An LNode given several
 * times answers the same naming at each position.
 *
 * Perf: core `getChildrenOfEach` (the Privates are transparent): 2 store reads whatever the number of LNodes when
 * every input is a record, 3 when refs are among them.
 *
 * @intent spec naming of many LNodes at once, sLnClass sLnInst of a batch of LNodes, LNodeSpecNaming without one read per LNode, auto-match LNodes against their specification
 *
 * @throws {@link DialecteError} `ELEMENT_TAGNAME_MISMATCH` when a ref names an element that is not an LNode.
 */
export async function readSpecNamings(
	query: Core.Query<Config>,
	params: ReadSpecNamingsParams,
): Promise<ReadSpecNamingsResult> {
	const namingsOfEach = await query.getChildrenOfEach(params.lnodes, {
		tagName: 'LNodeSpecNaming',
	})
	return namingsOfEach.map(firstNaming)
}

function firstNaming(
	namings: readonly Scl.TrackedRecord<'LNodeSpecNaming'>[],
): Scl.TrackedRecord<'LNodeSpecNaming'> | undefined {
	return namings[0]
}
