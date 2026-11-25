import { toRef } from '@dialecte/core/helpers'

import {
	asOutOfScopeVariable,
	listOutOfScopeVariables,
} from '@/v2019C1/extensions/clean-up/query/out-of-scope-variables'
import { readAttribute } from '@/v2019C1/helpers'
import { exclusiveGroupsHeld } from '@/v2019C1/hooks/shared/exclusive-groups'
import { PATH_PAIRS_BY_TAG } from '@/v2019C1/hooks/shared/path-references.constants'

import type { RepairedVariables } from './repair-out-of-scope-variables.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { ListedVariable } from '@/v2019C1/extensions/clean-up/query/out-of-scope-variables.types'
import type * as Core from '@dialecte/core'

/**
 * Repair every stored behaviour variable naming an element out of its behaviour's reach
 * (`query.cleanUp.findOutOfScopeVariables`): one with a counterpart in reach is given the counterpart's uuid, its local
 * path then written by the hooks from it (`rescoped`); one without has its reference cleared, its uuid, path and data
 * names, the variable kept, as the orphan rules clear a behaviour variable (`cleared`). A variable holding both its
 * reference groups (data and input or output) is left as it is (`left`): its groups are the caller's to settle first (the
 * commit refuses a rescope of it, `groups-together`). Answers each in the query's order. For projects
 * written before the commit refused such variables: once repaired, they copy, instantiate and update again.
 *
 * Perf: the query's reads, then one update per variable repaired; nothing written when nothing is listed.
 *
 * @intent repair out-of-scope behaviour variables, re-scope InputVar OutputVar to the LNode in reach, clear references a behaviour cannot name
 */
export async function repairOutOfScopeVariables(
	tx: Core.Transaction<Config>,
): Promise<RepairedVariables> {
	const listed = await listOutOfScopeVariables(tx)
	const repaired: RepairedVariables = { rescoped: [], cleared: [], left: [] }
	for (const entry of listed) {
		const answer = asOutOfScopeVariable(entry)
		if (holdsBothGroups(entry)) {
			repaired.left.push(answer)
			continue
		}
		await tx.update(toRef(entry.record) as Scl.Ref<Scl.ElementsOf>, {
			attributes: repairOf(entry),
		})
		if (entry.counterpart) repaired.rescoped.push(answer)
		else repaired.cleared.push(answer)
	}
	return repaired
}

/** Whether a variable holds attributes of both its reference groups. */
function holdsBothGroups(entry: ListedVariable): boolean {
	const pairs = PATH_PAIRS_BY_TAG.get(entry.record.tagName) ?? []
	return exclusiveGroupsHeld({ record: entry.record, pairs }) !== undefined
}

/** The attributes written on a variable: its counterpart's uuid, else its pair's uuid, path and data names cleared. */
function repairOf(entry: ListedVariable): Record<string, string | undefined> {
	const { pair, counterpart } = entry
	if (counterpart)
		return {
			[pair.attribute.uuid]: readAttribute({ record: counterpart, name: 'uuid', defaults: 'none' }),
		}
	return Object.fromEntries(
		[pair.attribute.uuid, pair.attribute.path, ...pair.companions.map(({ name }) => name)].map(
			(name) => [name, undefined],
		),
	)
}
