import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

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
}

/** Internal recursion state for {@link elementSignature}. */
export type ElementSignatureContext = {
	query: Core.Query<Config>
	resolveReferences: boolean
	ignore: ReadonlySet<string>
	memo: Map<string, string>
	seen: Set<string>
}

/** Minimal view of a definition attribute's schema metadata used by the signature. */
export type AttributeSchemaDetail = {
	/** XSD default value — an attribute written with this value is equivalent to being absent. */
	default?: string
}
