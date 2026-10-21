import { readConstraintScope } from './find-constraint-violation'
import { findUniqueValueInScope } from './resolve-unique-value'

import { readAttributes } from '@/v2019C1/helpers'

import type { ConstraintScope } from './find-constraint-violation.types'
import type { Rename } from './number-renames.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The names the renames of children of one parent end with, in order: every rename written first, then each numbered
 * in turn where its name is taken by a sibling — as `resolvePlacementCollision` numbers them once written, so a report
 * says what the apply writes. Two children swapping names need no number; a name a sibling keeps does.
 */
export async function numberRenames(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: { parentRef: Scl.Ref<Scl.ElementsOf>; renames: readonly Rename[] },
): Promise<string[]> {
	const { parentRef, renames } = params
	const scopes = new Map<string, ConstraintScope>()
	const names = new Map(renames.map(({ child, name }) => [child.id, name]))

	const numbered: string[] = []
	for (const { child } of renames) {
		const read =
			scopes.get(child.tagName) ??
			(await readConstraintScope(reader, { parentRef, childTag: child.tagName }))
		const scope = renamedScope({ scope: read, names })
		const candidate = { ...readAttributes({ record: child }), name: names.get(child.id) }
		const name = findUniqueValueInScope({
			scope,
			parentRef,
			childTag: child.tagName,
			candidate,
			attr: 'name',
			excludeId: child.id,
		})
		names.set(child.id, name)
		scopes.set(child.tagName, read)
		numbered.push(name)
	}
	return numbered
}

/** The scope with the names the renames give, as written. */
function renamedScope(params: {
	scope: ConstraintScope
	names: ReadonlyMap<string, string>
}): ConstraintScope {
	const { scope, names } = params
	return { ...scope, children: scope.children.map((child) => renamed({ child, names })) }
}

function renamed(params: {
	child: AnyTreeRecord
	names: ReadonlyMap<string, string>
}): AnyTreeRecord {
	const { child, names } = params
	const name = names.get(child.id)
	if (name === undefined) return child
	return {
		...child,
		attributes: child.attributes.map((attribute) =>
			attribute.name === 'name' ? { ...attribute, value: name } : attribute,
		),
	}
}
