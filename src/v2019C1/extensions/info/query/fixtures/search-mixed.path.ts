import { PATH_REFS } from './search-mixed.path.constants'

import type { SearchHit } from '../search.types'

/** The path of a hit of fixtures/search-mixed.xml from the root down, as its ids and as refs. */
export function pathOf(
	...ids: (keyof typeof PATH_REFS)[]
): Pick<SearchHit, 'ancestorIds' | 'ancestors'> {
	return { ancestorIds: [...ids], ancestors: ids.map((id) => ({ ...PATH_REFS[id] })) }
}
