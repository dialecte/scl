import {
	DEFAULT_IGNORED_ATTRIBUTES,
	NO_SKIP,
	RESOLVE_REFERENCES_PERF_SPAN,
} from './element-signature.constants'

import { throwDialecteError } from '@dialecte/core'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { DEFINITION } from '@/v2019C1/definition'
import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'

import type {
	AskedReferences,
	AskedUuid,
	AttributeSchemaDetail,
	ElementSignatureContext,
	ElementSignatureParams,
	ReferenceCache,
} from './element-signature.types'
import type { Scl, Config } from '@/v2019C1/config'
import type {
	ReferencePair,
	RefTagName,
	TypeIdReferencePair,
	TypeIdRefTagName,
} from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * Structural, **id-independent** signature of an element subtree.
 *
 * Two elements sharing a signature are structurally interchangeable: identity
 * attributes (`ignoreAttributes`, default `id`/`uuid`) are dropped, attributes
 * written with their schema default are folded out (so an explicit default and an
 * omitted attribute compare equal), and attributes and children are ordered
 * canonically. With `resolveReferences`, every id- or
 * uuid-based reference (detected via the reference registries) is folded in by
 * the *signature* of the element it points at rather than its id/uuid — so the
 * comparison never depends on identity anywhere in the resolved closure.
 *
 * Generic over element kind: works on DataTypeTemplates types (id refs), on
 * instances with uuid refs, or any mix. Reference cycles are broken with a
 * `@cycle` marker.
 *
 * @intent compare two subtrees structurally ignoring ids and uuids, detect equivalent or duplicate data types, content key of an element for dedup
 */
export async function elementSignature(
	query: Core.Query<Config>,
	params: ElementSignatureParams,
): Promise<string> {
	const context: ElementSignatureContext = {
		query,
		resolveReferences: params.resolveReferences ?? false,
		ignore: new Set(params.ignoreAttributes ?? DEFAULT_IGNORED_ATTRIBUTES),
		signatureCache: params.signatureCache ?? new Map(),
		referenceCache: params.referenceCache ?? new Map(),
		seen: new Set(),
	}
	return computeSignature(params.ref, context)
}

// ── Internals ───────────────────────────────────────────────────────────────────

/** The XSD default of `attributeName` on `tagName`, or `undefined` if it has none. */
function schemaDefault(tagName: string, attributeName: string): string | undefined {
	const element = DEFINITION[tagName as keyof typeof DEFINITION] as
		| { attributes?: { details?: Record<string, AttributeSchemaDetail> } }
		| undefined
	return element?.attributes?.details?.[attributeName]?.default
}

async function computeSignature(
	ref: Scl.Ref<Scl.ElementsOf>,
	context: ElementSignatureContext,
): Promise<string> {
	const key = `${ref.tagName}:${ref.id}`
	const cached = context.signatureCache.get(key)
	if (cached !== undefined) return cached
	if (context.seen.has(key)) return `@cycle:${ref.tagName}`

	context.seen.add(key)
	const tree = await context.query.getTree(ref)
	if (tree && context.resolveReferences) await resolveReferencesOf({ tree, context })
	const signature = tree ? await serialize(tree, context) : ''
	context.seen.delete(key)

	context.signatureCache.set(key, signature)
	return signature
}

async function serialize(
	node: Scl.TreeRecord<Scl.ElementsOf>,
	context: ElementSignatureContext,
): Promise<string> {
	const skip = context.resolveReferences ? pathAttributesToFold(node.tagName) : NO_SKIP

	const attributeParts: string[] = []
	for (const attribute of readAttributes({ record: node, defaults: 'none', fullObject: true })) {
		if (context.ignore.has(attribute.name) || skip.has(attribute.name)) continue
		// An attribute written with its schema default is equivalent to omitting it;
		// fold it out so an explicit default never forks against an absent one.
		if (attribute.value === schemaDefault(node.tagName, attribute.name)) continue
		let value = attribute.value
		if (context.resolveReferences) {
			const folded = await foldReference(node, attribute.name, attribute.value, context)
			if (folded !== null) value = `@sig:${folded}`
		}
		attributeParts.push(`${JSON.stringify(attribute.name)}:${JSON.stringify(value)}`)
	}
	attributeParts.sort()

	// Serialize children sequentially, not via Promise.all: a shared `seen` set only
	// distinguishes a genuine back-reference from a plain shared reference when children
	// run in order. Concurrent siblings would let one fold a type's real signature while a
	// second, suspended mid-await, sees the key in `seen` and emits a spurious `@cycle`
	// (order-dependent, so the same type hashes differently in source vs target and forks).
	const childParts: string[] = []
	for (const child of node.tree ?? []) {
		const part = await serialize(child, context)
		childParts.push(part)
	}
	childParts.sort()

	const text = node.value?.trim()
	const valuePart = text ? `,value:${JSON.stringify(text)}` : ''
	return `{tag:${JSON.stringify(node.tagName)},attrs:[${attributeParts.join(',')}]${valuePart},children:[${childParts.join(',')}]}`
}

/**
 * If `attributeName` on `node` is a reference, return the signature of the
 * element it points at; otherwise `null`.
 */
async function foldReference(
	node: Scl.TreeRecord<Scl.ElementsOf>,
	attributeName: string,
	value: string,
	context: ElementSignatureContext,
): Promise<string | null> {
	const typePair = typeIdPair(node, attributeName)
	if (typePair) {
		const target = askedAnswerOf({
			cache: context.referenceCache,
			key: referenceKey({ target: typePair.target, attribute: 'id', value }),
		})
		return target ? computeSignature(target, context) : `@missing:${value}`
	}

	const uuidPair = uuidPairForUuidAttribute(node.tagName, attributeName)
	if (uuidPair) {
		const target = askedUuidTargetOf({
			cache: context.referenceCache,
			targets: uuidPair.target,
			uuid: value,
		})
		return target ? computeSignature(target, context) : `@missing:${value}`
	}

	return null
}

function typeIdPair(
	node: Scl.TreeRecord<Scl.ElementsOf>,
	attributeName: string,
): TypeIdReferencePair | undefined {
	const pairs = TYPE_ID_REFERENCE_PAIRS[node.tagName as TypeIdRefTagName] as
		| readonly TypeIdReferencePair[]
		| undefined
	return pairs?.find((pair) => pair.attribute === attributeName && matchesWhen(node, pair))
}

function matchesWhen(node: Scl.TreeRecord<Scl.ElementsOf>, pair: TypeIdReferencePair): boolean {
	if (!pair.when) return true
	return (
		readAttribute({ record: node, name: pair.when.attribute, defaults: 'none' }) ===
		pair.when.equals
	)
}

function uuidPairForUuidAttribute(
	tagName: string,
	attributeName: string,
): ReferencePair | undefined {
	const pairs = UUID_REFERENCE_PAIRS[tagName as RefTagName] as readonly ReferencePair[] | undefined
	return pairs?.find((pair) => pair.attribute.uuid === attributeName)
}

/** The `path` companion of every uuid ref — folded into the uuid's signature, so omitted. */
function pathAttributesToFold(tagName: string): ReadonlySet<string> {
	const pairs = UUID_REFERENCE_PAIRS[tagName as RefTagName] as readonly ReferencePair[] | undefined
	if (!pairs) return NO_SKIP
	return new Set(pairs.map((pair) => pair.attribute.path))
}

/**
 * Look up, once per target tag, every reference value of `tree` the cache does not answer yet: an id pair's target tag
 * for all its ids, a uuid pair's first target tag for all its uuids, then each next target tag for the uuids the tags
 * before it did not hold. The first record per value, as a lookup of the value alone answers it.
 */
async function resolveReferencesOf(params: {
	tree: Scl.TreeRecord<Scl.ElementsOf>
	context: ElementSignatureContext
}): Promise<void> {
	const { tree, context } = params
	const asked = askedReferencesOf({ tree, ignore: context.ignore })
	if (asked.ids.size === 0 && asked.uuids.size === 0) return
	context.query.perf.start(RESOLVE_REFERENCES_PERF_SPAN)
	try {
		for (const [target, ids] of asked.ids) {
			await lookUp({ context, target, attribute: 'id', values: [...ids] })
		}
		await lookUpUuids({ context, uuids: asked.uuids })
	} finally {
		context.query.perf.stop(RESOLVE_REFERENCES_PERF_SPAN)
	}
}

/**
 * The id and uuid reference values of every node of `tree` its signature folds in (the attributes `serialize` keeps: not
 * ignored, not written with their schema default), by target tag (ids) and by uuid (its target tags).
 */
function askedReferencesOf(params: {
	tree: Scl.TreeRecord<Scl.ElementsOf>
	ignore: ReadonlySet<string>
}): AskedReferences {
	const { tree, ignore } = params
	const asked: AskedReferences = { ids: new Map(), uuids: new Map() }
	const pending: Scl.TreeRecord<Scl.ElementsOf>[] = [tree]
	while (pending.length > 0) {
		const node = pending.pop() as Scl.TreeRecord<Scl.ElementsOf>
		for (const attribute of readAttributes({ record: node, defaults: 'none', fullObject: true })) {
			if (ignore.has(attribute.name)) continue
			if (attribute.value === schemaDefault(node.tagName, attribute.name)) continue
			const typePair = typeIdPair(node, attribute.name)
			if (typePair) {
				const ids = asked.ids.get(typePair.target) ?? new Set<string>()
				asked.ids.set(typePair.target, ids.add(attribute.value))
				continue
			}
			const uuidPair = uuidPairForUuidAttribute(node.tagName, attribute.name)
			// keyed by the uuid and its pair's targets: two pairs may name different tags for one uuid
			if (uuidPair) {
				const key = `${uuidPair.target.join(',')}\u0000${attribute.value}`
				asked.uuids.set(key, { uuid: attribute.value, targets: uuidPair.target })
			}
		}
		pending.push(...((node.tree ?? []) as Scl.TreeRecord<Scl.ElementsOf>[]))
	}
	return asked
}

/**
 * The uuids looked up tag after tag: each round asks a target tag for the uuids that may name it and that no tag before
 * it in their pair held, never asked of that tag before.
 */
async function lookUpUuids(params: {
	context: ElementSignatureContext
	uuids: ReadonlyMap<string, AskedUuid>
}): Promise<void> {
	const { context, uuids } = params
	let depth = 0
	for (const { targets } of uuids.values()) depth = Math.max(depth, targets.length)
	for (let round = 0; round < depth; round++) {
		const byTag = new Map<string, string[]>()
		for (const { uuid, targets } of uuids.values()) {
			const target = targets[round]
			if (!target) continue
			const earlier = targets.slice(0, round)
			if (uuidTargetOf({ cache: context.referenceCache, targets: earlier, uuid })) continue
			const values = byTag.get(target) ?? []
			values.push(uuid)
			byTag.set(target, values)
		}
		for (const [target, values] of byTag) {
			await lookUp({ context, target, attribute: 'uuid', values })
		}
	}
}

/**
 * One lookup of `target` for the values the cache does not answer: each value then answered (`null` when none holds it).
 * Not the data model's `lookUpIds` (one record per id, duplicates left out) nor the clean-up's `lookUp` (every record of a
 * uuid, checked again after writes): a signature folds the first record per value, as a lookup of that value alone.
 */
async function lookUp(params: {
	context: ElementSignatureContext
	target: string
	attribute: 'id' | 'uuid'
	values: readonly string[]
}): Promise<void> {
	const { context, target, attribute } = params
	const cache = context.referenceCache
	const values = params.values.filter(
		(value) => !cache.has(referenceKey({ target, attribute, value })),
	)
	if (values.length === 0) return
	const filter: Record<string, readonly string[]> = { [attribute]: values }
	const records = await context.query.findByAttributes({
		tagName: target as Scl.ElementsOf,
		attributes: filter,
	})
	for (const value of values) cache.set(referenceKey({ target, attribute, value }), null)
	for (const record of records) {
		const key = referenceKey({
			target,
			attribute,
			value: readAttribute({ record, name: attribute }),
		})
		// the first record per value, as a lookup of that value alone answers it
		if (cache.get(key) === null) {
			cache.set(key, { tagName: target, id: record.id } as unknown as Scl.Ref<Scl.ElementsOf>)
		}
	}
}

/** The element a uuid names among `targets`, the first tag first, as the cache answers it. */
function uuidTargetOf(params: {
	cache: ReferenceCache
	targets: readonly string[]
	uuid: string
}): Scl.Ref<Scl.ElementsOf> | null {
	for (const target of params.targets) {
		const found = params.cache.get(referenceKey({ target, attribute: 'uuid', value: params.uuid }))
		if (found) return found
	}
	return null
}

/**
 * What the cache answers for a reference value folded into a signature: the ref found, or `null` when its tag holds none.
 * A value never asked means the lookups before the fold missed it (`askedReferencesOf` and `serialize` disagree): that
 * refuses, never folds a silent `@missing`.
 */
function askedAnswerOf(params: {
	cache: ReferenceCache
	key: string
}): Scl.Ref<Scl.ElementsOf> | null {
	const answer = params.cache.get(params.key)
	if (answer === undefined) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: `elementSignature: a reference folded before it was looked up (${params.key.replaceAll('\u0000', ' ')})`,
		})
	}
	return answer
}

/**
 * The element a uuid names among `targets`, the first tag first, as the lookups before the fold answered it: each tag up
 * to the first that holds it was asked (`askedAnswerOf` refuses one that was not).
 */
function askedUuidTargetOf(params: {
	cache: ReferenceCache
	targets: readonly string[]
	uuid: string
}): Scl.Ref<Scl.ElementsOf> | null {
	for (const target of params.targets) {
		const found = askedAnswerOf({
			cache: params.cache,
			key: referenceKey({ target, attribute: 'uuid', value: params.uuid }),
		})
		if (found) return found
	}
	return null
}

/** The key of a looked-up reference value in the cache. */
function referenceKey(params: { target: string; attribute: string; value: string }): string {
	const { target, attribute, value } = params
	return `${target}\u0000${attribute}\u0000${value}`
}
