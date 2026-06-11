import { buildMappedLNodePath } from '../build/build-mapped-lnode-path'
import { resolveElementPath } from './resolve-element-path'

import type { MappedLNodeAttributes } from '../build/build-mapped-lnode-path'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const LN_TARGETS = new Set(['LN', 'LN0'])

type LnRecord = Scl.TrackedRecord<'LN' | 'LN0'>

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
): Promise<LnRecord | undefined> {
	const path = buildMappedLNodePath(readMappedAttributes(lnode))
	if (!path) return undefined

	const resolved = await resolveElementPath(query, path)
	if (!resolved || !LN_TARGETS.has(resolved.tagName)) return undefined

	return resolved as LnRecord
}

// ── Internal ─────────────────────────────────────────────────────────

function readMappedAttributes(lnode: Scl.TrackedRecord<'LNode'>): MappedLNodeAttributes {
	const get = (name: string) => lnode.attributes.find((a) => a.name === name)?.value

	return {
		iedName: get('iedName'),
		ldInst: get('ldInst'),
		prefix: get('prefix'),
		lnClass: get('lnClass'),
		lnInst: get('lnInst'),
	}
}
