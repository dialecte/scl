import { DEFAULT_IGNORED_ATTRIBUTES } from './element-signature.constants'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { DEFINITION } from '@/v2019C1/definition'
import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'

import type {
	AttributeSchemaDetail,
	ElementSignatureContext,
	ElementSignatureParams,
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
		seen: new Set(),
	}
	return computeSignature(params.ref, context)
}

// ── Internals ───────────────────────────────────────────────────────────────────

const NO_SKIP: ReadonlySet<string> = new Set()

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
	for (const attribute of node.attributes) {
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
	// Serialize children sequentially, not via Promise.all: a shared `seen` set only
	// distinguishes a genuine back-reference from a plain shared reference when children
	// run in order. Concurrent siblings would let one fold a type's real signature while a
	// second, suspended mid-await, sees the key in `seen` and emits a spurious `@cycle`
	// (order-dependent, so the same type hashes differently in source vs target and forks).
	const childParts: string[] = []
	for (const child of node.tree ?? []) {
		childParts.push(await serialize(child, context))
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
		const target = await resolveById(context.query, typePair.target, value)
		return target ? computeSignature(target, context) : `@missing:${value}`
	}

	const uuidPair = uuidPairForUuidAttribute(node.tagName, attributeName)
	if (uuidPair) {
		const target = await resolveByUuid(context.query, uuidPair.target, value)
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
	return node.attributes.find((a) => a.name === pair.when!.attribute)?.value === pair.when.equals
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

async function resolveById(
	query: Core.Query<Config>,
	target: string,
	id: string,
): Promise<Scl.Ref<Scl.ElementsOf> | null> {
	const [record] = await query.findByAttributes({
		tagName: target as Scl.ElementsOf,
		attributes: { id },
	})
	return record ? ({ tagName: target, id: record.id } as unknown as Scl.Ref<Scl.ElementsOf>) : null
}

async function resolveByUuid(
	query: Core.Query<Config>,
	targets: readonly string[],
	uuid: string,
): Promise<Scl.Ref<Scl.ElementsOf> | null> {
	for (const target of targets) {
		const [record] = await query.findByAttributes({
			tagName: target as Scl.ElementsOf,
			attributes: { uuid },
		})
		if (record) return { tagName: target, id: record.id } as unknown as Scl.Ref<Scl.ElementsOf>
	}
	return null
}
