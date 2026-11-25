import { judgeKeyTaken } from '@/v2019C1/extensions/lifecycle/constraints/judge-key-taken'
import { findConstraintParent } from '@/v2019C1/extensions/lifecycle/constraints/resolve-placement-collision'

import type { Config, Scl } from '@/v2019C1/config'
import type { JudgedKey } from '@/v2019C1/extensions/lifecycle/constraints/judge-key-taken.types'
import type * as Core from '@dialecte/core'

/**
 * What the moved element shares with its siblings where it now sits (through a `Private` wrapper,
 * `findConstraintParent`): the key taken with the values the engine proposes instead, or an identity collision, judged
 * as `applyMove` writes and refuses them (`judgeKeyTaken`).
 */
export async function judgeMovedName(
	query: Core.Query<Config>,
	params: { ref: Scl.Ref<Scl.ElementsOf> },
): Promise<JudgedKey> {
	const { ref } = params
	const parentRef = await findConstraintParent(query, { ref })
	if (!parentRef) return {}
	const candidate: Record<string, string | undefined> = await query.getAttributes(ref)
	return judgeKeyTaken(query, { parentRef, tagName: ref.tagName, candidate, excludeId: ref.id })
}
