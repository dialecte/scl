import { toRef } from '@dialecte/core/helpers'

import {
	constraintFields,
	constraintsSelecting,
	findConstraintParent,
	findViolationInScope,
	identityCollisionInScope,
	makeUnique,
	refuseIdentityCollision,
} from '@/v2019C1/extensions/lifecycle/constraints'
import { readConstraintScope } from '@/v2019C1/extensions/lifecycle/constraints/find-constraint-violation'

import type { TouchedElement } from './recheck-after-apply.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Hold what a run of operations wrote — from its `from`-th staged operation on — to the uniqueness rules of where each
 * element sits, as the engine holds its own writes: an element the run created, or whose key the run changed, that
 * shares a key with a sibling is numbered on the key's editable field (`makeUnique`), and refused with
 * `IDENTITY_COLLISION` when the key has none. A collision the run did not cause (a key it did not touch) is the
 * project's, left as it is; an element deleted since is skipped.
 */
export async function recheckAfterApply(
	tx: Core.Transaction<Config>,
	params: { from: number },
): Promise<void> {
	for (const touched of touchedElements(tx, params)) {
		const { ref, created, changed } = touched
		// an update that changed no attribute (a child added under it) changes no key
		if (!created && changed.size === 0) continue
		if (!(await tx.getRecord(ref))) continue
		const parentRef = await findConstraintParent(tx, { ref })
		if (!parentRef) continue
		// the rules of where it sits, read from the definition first: an update touching none of their fields is left
		const parentDefinition = await tx.getDefinition(parentRef)
		const constraints = constraintsSelecting({ parentDefinition, childTag: ref.tagName })
		const keyFields = constraints.flatMap((constraint) => constraintFields(constraint))
		if (!created && !keyFields.some((field) => changed.has(field))) continue
		const scope = await readConstraintScope(tx, { parentRef, childTag: ref.tagName })
		const candidate = await tx.getAttributes(ref)
		const violation = findViolationInScope({ scope, candidate, excludeId: ref.id })
		if (!violation) continue
		if (!created && !violation.fields.some((field) => changed.has(field))) continue

		const collision = identityCollisionInScope({
			scope,
			tagName: ref.tagName,
			candidate,
			excludeId: ref.id,
		})
		if (collision) refuseIdentityCollision({ element: ref, collision })
		await makeUnique(tx, { ref })
	}
}

/** The elements the run created or updated, each once, as the run leaves them: one it deleted again is left out. */
function touchedElements(tx: Core.Transaction<Config>, params: { from: number }): TouchedElement[] {
	const touched = new Map<string, TouchedElement>()
	for (const operation of tx.getStagedOperations().slice(params.from)) {
		if (operation.status === 'deleted') {
			touched.delete(operation.oldRecord.id)
			continue
		}
		const { newRecord } = operation
		const element = touched.get(newRecord.id) ?? {
			ref: toRef(newRecord) as Scl.Ref<Scl.ElementsOf>,
			created: false,
			changed: new Set<string>(),
		}
		if (operation.status === 'created') element.created = true
		else {
			for (const name of changedAttributeNames(operation)) element.changed.add(name)
		}
		touched.set(newRecord.id, element)
	}
	return [...touched.values()]
}

/** The names of the attributes an update gave another value, added or removed. */
function changedAttributeNames(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
}): string[] {
	const before = new Map(
		params.oldRecord.attributes.map((attribute) => [attribute.name, attribute.value]),
	)
	const after = new Map(
		params.newRecord.attributes.map((attribute) => [attribute.name, attribute.value]),
	)
	const names = new Set([...before.keys(), ...after.keys()])
	return [...names].filter((name) => before.get(name) !== after.get(name))
}
