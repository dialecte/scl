import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** `${tagName}:${id}` — the key of a signature cache entry. */
type TagNameId = string
/** Canonical structural signature string of an element subtree. */
type Signature = string

/** Cache of computed element signatures, keyed by `tagName:id`. */
export type SignatureCache = Map<TagNameId, Signature>

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
}

/** Internal recursion state for {@link elementSignature}. */
export type ElementSignatureContext = {
	query: Core.Query<Config>
	resolveReferences: boolean
	ignore: ReadonlySet<string>
	signatureCache: SignatureCache
	seen: Set<string>
}

/** Minimal view of a definition attribute's schema metadata used by the signature. */
export type AttributeSchemaDetail = {
	/** XSD default value — an attribute written with this value is equivalent to being absent. */
	default?: string
}
