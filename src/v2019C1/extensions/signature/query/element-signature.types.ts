import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** `${tagName}:${id}` — the key of a signature cache entry. */
type TagNameId = string
/** Canonical structural signature string of an element subtree. */
type Signature = string

/** Cache of computed element signatures, keyed by `tagName:id`. */
export type SignatureCache = Map<TagNameId, Signature>

/**
 * The elements the references signed name, by the target tag, the attribute looked up and its value (`tagName` NUL
 * `attribute` NUL `value`): the ref found, or `null` when the tag holds none. Shared across calls as
 * {@link SignatureCache} is: over one document, with no write between the calls.
 */
export type ReferenceCache = Map<string, Scl.Ref<Scl.ElementsOf> | null>

export type ElementSignatureParams = {
	ref: Scl.Ref<Scl.ElementsOf>
	/**
	 * Fold id- and uuid-based references into the *signature* of the element they
	 * point at (detected per element via the reference registries), so the result
	 * is independent of the referenced element's id/uuid. Default `false` — only
	 * the element's own subtree is signed.
	 */
	resolveReferences?: boolean
	/** Attribute names excluded from the signature. Default: `id`, `uuid`. */
	ignoreAttributes?: readonly string[]
	/**
	 * Shared signature cache reused across calls. Pass the same map to every
	 * `elementSignature` over ONE query/document so a descendant referenced by many
	 * top-level elements is computed once, not per caller. Never share across
	 * different documents — ids are only unique within one.
	 */
	signatureCache?: SignatureCache
	/**
	 * The elements the references signed name, reused across calls (see {@link ReferenceCache}). Pass the same map to
	 * every `elementSignature` over ONE document with no write between them; never across documents.
	 */
	referenceCache?: ReferenceCache
}

/** Internal recursion state for {@link elementSignature}. */
export type ElementSignatureContext = {
	query: Core.Query<Config>
	resolveReferences: boolean
	ignore: ReadonlySet<string>
	signatureCache: SignatureCache
	referenceCache: ReferenceCache
	seen: Set<string>
}

/**
 * The references of one tree to look up: per target tag, the ids asked; per uuid and target list (`targets` NUL `uuid`),
 * the uuid and the target tags its pair names, the first first (two pairs may name different tags for one uuid).
 */
export type AskedReferences = {
	ids: Map<string, Set<string>>
	uuids: Map<string, AskedUuid>
}

/** A uuid to look up, and the target tags of the pair holding it, in the order they are asked. */
export type AskedUuid = { uuid: string; targets: readonly string[] }

/** Minimal view of a definition attribute's schema metadata used by the signature. */
export type AttributeSchemaDetail = {
	/** XSD default value — an attribute written with this value is equivalent to being absent. */
	default?: string
}
