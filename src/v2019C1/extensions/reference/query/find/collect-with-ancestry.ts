import { collectFromTags } from './collect-from-tags'
import { collectFromTree } from './collect-from-tree'

import { ROOT_ELEMENT } from '@/v2019C1/definition/constants.generated'

import type {
	CollectedWithAncestry,
	CollectWithAncestryParams,
} from './collect-with-ancestry.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Reads a subtree once and lays it flat: every element of it in document order (the sequence the
 * dialecte declares for the children of each element, as `getTree` orders them), with the records
 * above each, outermost first.
 *
 * A select from the document root reads the elements of the tags it names by tag name
 * (`collectFromTags`): on a document whose data instances far outnumber the section read it is
 * several times faster than reading the whole document, though a tag below a `true` entry (`Val`,
 * `Text`, `Private`...) is read in the whole document. A root below the document root, or no select,
 * reads the document once as a tree (`collectFromTree`): a flat collect under a lower root reads
 * every element of each tag in the whole document and checks each against the root, which was
 * measured three times slower on a document of 200 000 elements.
 *
 * A root that is not found: the tree path throws `ELEMENT_NOT_FOUND` (as `getTree` does), the tags
 * path (always the document root) returns an empty read.
 */
export async function collectWithAncestry(
	query: Core.Query<Config>,
	params: CollectWithAncestryParams,
): Promise<CollectedWithAncestry> {
	const { root = { tagName: ROOT_ELEMENT }, select } = params
	const readsSectionOfDocument = select !== undefined && root.tagName === ROOT_ELEMENT
	return readsSectionOfDocument
		? collectFromTags(query, { select })
		: collectFromTree(query, { root, select })
}
