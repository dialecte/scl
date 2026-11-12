import { buildMappedLNodePath } from '../build/build-mapped-lnode-path'

import { readAttributes } from '@/v2019C1/helpers'

import type { MappedLNodeKey } from './mapped-lnode-key.types'
import type { AnyRawRecord, AnyTrackedRecord } from '@dialecte/core'

/**
 * The one rule deciding what names the logical node implementing an LNode: a truthy `lnUuid` alone,
 * even when it names nothing; otherwise the complete name path. `undefined` when it names none.
 */
export function mappedLNodeKey(lnode: AnyRawRecord | AnyTrackedRecord): MappedLNodeKey | undefined {
	const attributes = readAttributes({ record: lnode, defaults: 'none' })
	if (attributes.lnUuid) return { kind: 'uuid', uuid: attributes.lnUuid }
	const path = buildMappedLNodePath(attributes)
	return path ? { kind: 'path', path } : undefined
}
