import { buildMappedLNodePath } from '../build/build-mapped-lnode-path'
import { resolveElementPath } from './resolve-element-path'
import { LN_TARGETS } from './resolve-mapped-lnode.constants'

import { LNODE_NAMING_ATTRIBUTES } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { MappedLNodeAttributes } from '../build/build-mapped-lnode-path.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Resolves a mapped `LNode` to the IED `LN` (or `LN0`) that implements it.
 *
 * Reads the LNode's implementation attributes, composes the IED-section path
 * via {@link buildMappedLNodePath}, then resolves it with
 * {@link resolveElementPath}. Returns `undefined` for unmapped LNodes or when
 * the path does not resolve to an `LN`/`LN0`.
 *
 * @example
 * const ln = await resolveMappedLNode(query, lnodeRecord)
 * // → TrackedRecord<'LN' | 'LN0'> for the implementing LN, or undefined
 */
export async function resolveMappedLNode(
	query: Core.Query<Config> | Core.Transaction<Config>,
	lnode: Scl.TrackedRecord<'LNode'>,
): Promise<Scl.TrackedRecord<'LN' | 'LN0'> | undefined> {
	const path = buildMappedLNodePath(readMappedAttributes(lnode))
	if (!path) return undefined

	const resolved = await resolveElementPath(query, path)
	if (!resolved || !LN_TARGETS.has(resolved.tagName)) return undefined

	return resolved as Scl.TrackedRecord<'LN' | 'LN0'>
}

// ── Internal ─────────────────────────────────────────────────────────

/** The attributes of the LNode naming the LN that implements it. */
function readMappedAttributes(lnode: Scl.TrackedRecord<'LNode'>): MappedLNodeAttributes {
	return Object.fromEntries(
		LNODE_NAMING_ATTRIBUTES.map((name) => [
			name,
			readAttribute({ record: lnode, name, defaults: 'none', fullObject: true })?.value,
		]),
	)
}
