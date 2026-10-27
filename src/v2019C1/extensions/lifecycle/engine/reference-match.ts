import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { PlaceholderLineages } from './placeholder-lineages.types'
import type { RedirectedSourceUuids, ReferenceIdentitySide } from './reference-match.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The reference identity of a link element: the set of target `*Uuid` attributes it carries, as a
 * stable string. On the instance side (`side: 'instance'`), each target uuid is brought back to the
 * source by the scenario's key: to its element's `templateUuid` for an instance of a template, so an
 * instantiated (remapped) reference compares equal to the template reference it came from; to itself
 * under `uuid`, where source and project share their uuids. A target the source element was MAPPED
 * onto carries no lineage: `redirectedSourceUuids` gives the source element it stands for. The source
 * side reads the raw uuids. Returns `undefined` when no uuid attribute is set (unresolved ref), so
 * matching falls back to position. Lineage-aware by design — this is a matching helper, not an
 * agnostic identity read.
 */
export async function referenceIdentity(
	query: Reader,
	node: AnyTreeRecord,
	options: ReferenceIdentitySide,
): Promise<string | undefined> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const parts: string[] = []
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const identity =
			options.side === 'instance'
				? (options.redirectedSourceUuids?.get(uuidValue) ??
					(await toSourceSpaceUuid(query, {
						uuidValue,
						targetTags: pair.target,
						matchKey: options.matchKey,
					})))
				: uuidValue
		parts.push(`${pair.attribute.uuid}=${identity}`)
	}
	return parts.length > 0 ? parts.sort().join('|') : undefined
}

/**
 * Bring an instance target `uuid` back to the source: under `templateUuid`, the referenced element's
 * `templateUuid` if it is an instance, else the uuid itself (an external/unresolvable target); under
 * `uuid`, the uuid itself — the source names its elements by the uuids the project shares.
 */
async function toSourceSpaceUuid(
	query: Reader,
	params: { uuidValue: string; targetTags: readonly string[]; matchKey: MatchKey },
): Promise<string> {
	const { uuidValue, targetTags, matchKey } = params
	if (matchKey === 'uuid') return uuidValue
	for (const tagName of targetTags) {
		const matches = await query.any.findByAttributes({
			tagName: tagName as Parameters<typeof query.any.findByAttributes>[0]['tagName'],
			attributes: { uuid: uuidValue } as Record<string, string>,
		})
		const target = matches[0]
		if (target) {
			const templateUuid = await query.any.getAttribute(target, { name: matchKey })
			return templateUuid || uuidValue
		}
	}
	return uuidValue
}

/**
 * Fallback identity for a reference node: the NAME of each resolved target element. Stable across
 * instantiate even when the project uses placeholder `templateUuid`s that are not the source
 * element's own `uuid` (so the uuid round-trip in {@link referenceIdentity} cannot bridge the two
 * sides). Undefined when no target resolves to a named element.
 */
export async function referenceNameIdentity(
	query: Reader,
	node: AnyTreeRecord,
): Promise<string | undefined> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const parts: string[] = []
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const name = await resolveTargetName(query, uuidValue, pair.target)
		if (name === undefined) continue
		parts.push(`${pair.attribute.uuid}=${name}`)
	}
	return parts.length > 0 ? parts.sort().join('|') : undefined
}

/**
 * The placeholder lineage a reference of the project names through: the first of its targets whose lineage under the
 * scenario's key is one of `placeholderLineages` (see `PlaceholderLineages`). Undefined when none is: the reference is
 * then paired by the uuids it names only.
 */
export async function placeholderLineageOf(
	query: Reader,
	node: AnyTreeRecord,
	params: { matchKey: MatchKey; placeholderLineages: PlaceholderLineages },
): Promise<string | undefined> {
	const { matchKey, placeholderLineages } = params
	if (placeholderLineages.size === 0) return undefined
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const target = await findTarget(query, { uuidValue, targetTags: pair.target })
		if (!target) continue
		const lineage = await query.any.getAttribute(target, { name: matchKey })
		if (lineage && placeholderLineages.has(lineage)) return lineage
	}
	return undefined
}

async function findTarget(
	query: Reader,
	params: { uuidValue: string; targetTags: readonly string[] },
): Promise<AnyTreeRecord | undefined> {
	for (const tagName of params.targetTags) {
		const [target] = await query.any.findByAttributes({
			tagName: tagName as Parameters<typeof query.any.findByAttributes>[0]['tagName'],
			attributes: { uuid: params.uuidValue } as Record<string, string>,
		})
		if (target) return target as AnyTreeRecord
	}
	return undefined
}

async function resolveTargetName(
	query: Reader,
	uuidValue: string,
	targetTags: readonly string[],
): Promise<string | undefined> {
	const target = await findTarget(query, { uuidValue, targetTags })
	if (!target) return undefined
	const name = await query.any.getAttribute(target, { name: 'name' })
	return name || undefined
}

/**
 * Index redirect mappings for the matcher: the `uuid` of each project element mapped onto -> the
 * `uuid` of the source element it stands for.
 */
export async function indexRedirectedSourceUuids(
	query: Reader,
	redirectMappings: readonly RedirectMapping[] | undefined,
): Promise<RedirectedSourceUuids> {
	const redirectedSourceUuids = new Map<string, string>()
	for (const { sourceUuid, target } of redirectMappings ?? []) {
		const targetUuid = await query.any.getAttribute(target as Scl.Ref<Scl.ElementsOf>, {
			name: 'uuid',
		})
		if (targetUuid) redirectedSourceUuids.set(targetUuid, sourceUuid)
	}
	return redirectedSourceUuids
}
