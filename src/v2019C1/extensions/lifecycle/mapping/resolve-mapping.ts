import type { MappingPolicy, ResolvedMapping } from './mapping.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** A read surface shared by the report (Query) and the apply (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * Decide where a shared source element lands in the project — the ONE answer the report and the
 * apply both read, so the review shows what is applied.
 *
 * The project element carrying the same key (its name) is the one the source element stands for.
 * With none, a new element is created; with several, none is picked and a new one is created too.
 */
export async function resolveMapping(
	reader: Reader,
	params: {
		sourceQuery: Core.Query<Config>
		sourceRef: Scl.Ref<Scl.ElementsOf>
		policy: MappingPolicy
	},
): Promise<ResolvedMapping> {
	const { sourceQuery, sourceRef, policy } = params

	const key = await sourceQuery.any.getAttribute(sourceRef, { name: policy.key })
	if (!key) return { reason: 'none', ambiguous: false }

	const sameKey = await reader.any.findByAttributes({
		tagName: policy.tagName,
		attributes: { [policy.key]: key },
	})
	if (sameKey.length === 0) return { reason: 'none', ambiguous: false }
	if (sameKey.length > 1) return { reason: 'name', ambiguous: true }

	return { existing: sameKey[0], reason: 'name', ambiguous: false }
}
