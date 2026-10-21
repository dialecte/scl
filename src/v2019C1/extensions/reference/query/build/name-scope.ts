import { SCOPED_NAME_KEY_SEPARATOR } from './name-scope.constants'

import type { ReferencePair } from '@/v2019C1/extensions/reference/constants/types'

/**
 * The tag of the ancestor a `scoped-name` pair's name is unique in (`nameScope`), `undefined` for
 * any other pair.
 */
export function nameScopeOf(pair: ReferencePair): string | undefined {
	return 'nameScope' in pair ? pair.nameScope : undefined
}

/**
 * The key a name is looked up by in its scope: the path of the scope element and the name. The
 * parser and the import index build it alike.
 */
export function scopedNameKey(params: { scopePath: string; name: string }): string {
	const { scopePath, name } = params
	return `${scopePath}${SCOPED_NAME_KEY_SEPARATOR}${name}`
}
