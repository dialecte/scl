import { throwDialecteError } from '@dialecte/core'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import {
	REFERENCE_UUIDS_BY_TAG,
	TEXT_NAMED_REFERRER_TAGS,
} from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { REFERRER_DISCRIMINATORS } from '@/v2019C1/extensions/reference/constants/referrer-discriminators.constants'

import type { PlaceholderLineages } from './placeholder-lineages.types'
import type { RedirectedSourceUuids, ReferenceIdentitySide } from './reference-match.types'
import type { TargetLineages } from './target-lineages.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The reference identity of a link element: the set of target uuid attributes it carries (those of its uuid pairs and
 * of its tuple pairs, see `REFERENCE_UUIDS_BY_TAG`), as a stable string. On the instance side (`side: 'instance'`),
 * each target uuid is brought back to the source by the scenario's key: to its element's `templateUuid` for an
 * instance of a template (read from `targetLineages`, once per diff), so an instantiated (remapped) reference compares
 * equal to the template reference it came from; to itself under `uuid`, where source and project share their uuids. A
 * target the source element was MAPPED onto carries no lineage: `redirectedSourceUuids` gives the source element it
 * stands for. The source side reads the raw uuids. A referrer naming several things on one target (data set entries on
 * one logical node) adds what tells them apart (`REFERRER_DISCRIMINATORS`). Returns `undefined` when no uuid attribute
 * is set (unresolved ref). Lineage-aware by design — this is a matching helper, not an agnostic identity read.
 */
export async function referenceIdentity(
	query: Reader,
	node: AnyTreeRecord,
	options: ReferenceIdentitySide,
): Promise<string | undefined> {
	const references = REFERENCE_UUIDS_BY_TAG.get(node.tagName)
	if (!references) return undefined
	const attributes = await query.any.getAttributes(node)
	const parts: string[] = []
	for (const reference of references) {
		const uuidValue = attributes[reference.uuid]
		if (!uuidValue) continue
		const identity = identityOf({ uuidValue, targetTags: reference.target, options })
		if (identity === undefined) return undefined
		parts.push(`${reference.uuid}=${identity}`)
	}
	if (parts.length === 0) return undefined
	return [
		parts.sort().join('|'),
		...discriminatorParts({ tagName: node.tagName, attributes }),
	].join('|')
}

/** What tells apart two referrers of a tag naming one target, as `name=value` parts: see `REFERRER_DISCRIMINATORS`. */
function discriminatorParts(params: {
	tagName: string
	attributes: Readonly<Record<string, string | undefined>>
}): string[] {
	const names = REFERRER_DISCRIMINATORS.get(params.tagName) ?? []
	return names.map((name) => `${name}=${params.attributes[name] ?? ''}`)
}

/** One uuid a reference names, brought back to the source as its side reads it: see `ReferenceIdentitySide`. */
function identityOf(params: {
	uuidValue: string
	targetTags: readonly string[]
	options: ReferenceIdentitySide
}): string | undefined {
	const { uuidValue, targetTags, options } = params
	switch (options.side) {
		case 'source':
			return uuidValue
		case 'project':
			return (
				options.redirectedSourceUuids?.get(uuidValue) ??
				(options.readsSourceUuids ? uuidValue : undefined)
			)
		case 'instance':
			return (
				options.redirectedSourceUuids?.get(uuidValue) ??
				toSourceSpaceUuid({
					uuidValue,
					targetTags,
					matchKey: options.matchKey,
					targetLineages: options.targetLineages,
				})
			)
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `referenceIdentity: unhandled side ${String(options satisfies never)}`,
			})
	}
}

/**
 * Bring an instance target `uuid` back to the source: under `templateUuid`, the referenced element's
 * `templateUuid` if it is an instance, else the uuid itself (an external/unresolvable target); under
 * `uuid`, the uuid itself — the source names its elements by the uuids the project shares.
 */
function toSourceSpaceUuid(params: {
	uuidValue: string
	targetTags: readonly string[]
	matchKey: MatchKey
	targetLineages: TargetLineages
}): string {
	if (params.matchKey === 'uuid') return params.uuidValue
	return lineageOf(params) || params.uuidValue
}

/**
 * The lineage, under the scenario's key, of the element of one of `targetTags` a project uuid names, as `targetLineages`
 * read it: its `templateUuid`, or under `uuid` the uuid itself. Undefined when no such element carries the uuid, or
 * carries no lineage.
 */
function lineageOf(params: {
	uuidValue: string
	targetTags: readonly string[]
	targetLineages: TargetLineages
}): string | undefined {
	const { uuidValue, targetTags, targetLineages } = params
	const carriers = targetLineages.get(uuidValue) ?? []
	for (const tagName of targetTags) {
		const target = carriers.find((carrier) => carrier.tagName === tagName)
		if (target) return target.lineage
	}
	return undefined
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
 * The names a tuple reference gives what it names (an IED, an access point, a device, a control block), as a stable
 * string, with what tells apart two naming the same (`REFERRER_DISCRIMINATORS`): how a tuple referrer with no uuid of
 * its own (a `ConnectedAP` written without `apUuid`, a GOOSE receiver naming an IED outside the file) is paired when it
 * names nothing by uuid. An `IEDName` gives its IED as its text. Undefined when it gives no name.
 */
export async function tupleNamesIdentity(
	query: Reader,
	node: AnyTreeRecord,
): Promise<string | undefined> {
	const references = REFERENCE_UUIDS_BY_TAG.get(node.tagName)
	if (!references) return undefined
	const attributes = await query.any.getAttributes(node)
	const names = [...new Set(references.flatMap((reference) => reference.names))].sort()
	const parts = names.flatMap((name) => (attributes[name] ? [`${name}=${attributes[name]}`] : []))
	const text = TEXT_NAMED_REFERRER_TAGS.has(node.tagName) ? node.value.trim() : ''
	if (text) parts.push(`#text=${text}`)
	if (parts.length === 0) return undefined
	return [...parts, ...discriminatorParts({ tagName: node.tagName, attributes })].join('|')
}

/**
 * The placeholder lineage a reference of the project names through: the first of its targets whose lineage under the
 * scenario's key is one of `placeholderLineages` (see `PlaceholderLineages`). Undefined when none is: the reference is
 * then paired by the uuids it names only.
 */
export async function placeholderLineageOf(
	query: Reader,
	node: AnyTreeRecord,
	params: {
		placeholderLineages: PlaceholderLineages
		/** The lineage of what the project's references name under the scenario's key, read once: see `readTargetLineages`. */
		targetLineages: TargetLineages
	},
): Promise<string | undefined> {
	const { placeholderLineages, targetLineages } = params
	if (placeholderLineages.size === 0) return undefined
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const attributes = await query.any.getAttributes(node)
	for (const pair of pairs) {
		const uuidValue = attributes[pair.attribute.uuid]
		if (!uuidValue) continue
		const lineage = lineageOf({ uuidValue, targetTags: pair.target, targetLineages })
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
