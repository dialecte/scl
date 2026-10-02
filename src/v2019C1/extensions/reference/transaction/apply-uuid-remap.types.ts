import type { Scl } from '@/v2019C1/config'

/**
 * A source element that was not cloned because it maps onto an element the target already
 * holds: references to the source element are repointed to that element.
 */
export type RedirectMapping = {
	/** The `uuid` of the source element. */
	sourceUuid: string
	/** The target element the source element maps onto. */
	target: Scl.Ref<Scl.ElementsOf>
}
