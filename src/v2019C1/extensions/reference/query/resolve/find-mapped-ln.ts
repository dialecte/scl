import { findNativeLnByPath } from './find-native-ln-by-path'
import { findNativeLnByUuid } from './find-native-ln-by-uuid'
import { mappedLNodeKey } from './mapped-lnode-key'

import type { NativeLogicalNode } from './find-native-ln.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What implements one LNode, by the rule `resolveMappedLNodes` applies to many, without reading the
 * whole document: the logical node its `lnUuid` names, else the one of its complete name path.
 */
export async function findMappedLn(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { lnode: Scl.TrackedRecord<'LNode'> },
): Promise<NativeLogicalNode | undefined> {
	const key = mappedLNodeKey(params.lnode)
	if (!key) return undefined
	return key.kind === 'uuid'
		? findNativeLnByUuid(query, { uuid: key.uuid })
		: findNativeLnByPath(query, { path: key.path })
}
