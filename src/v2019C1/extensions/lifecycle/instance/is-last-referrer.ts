import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Whether an element is referred to only from the containers leaving with it: no other container of that tag refers
 * to it. A function an application no longer composes, or a function of an application a template dropped, stays
 * while another application still composes it.
 */
export async function isLastReferrer(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: {
		target: Scl.Ref<Scl.ElementsOf>
		/** The tag of the containers whose references count: an application composing a function. */
		containerTagName: Scl.ElementsOf
		/** The containers leaving with the element, by record id: their references do not keep it. */
		leavingIds: ReadonlySet<string>
	},
): Promise<boolean> {
	const { target, containerTagName, leavingIds } = params
	const referrers = await findRefsPointingTo(reader, {
		target,
		containerTagName,
	})
	return referrers.every(({ container }) => !container || leavingIds.has(container.id))
}
