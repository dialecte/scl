import { DEFINITION } from '@/v2019C1/definition/definition.generated'

import type { ConstraintViolation, SchemaConstraint } from './find-constraint-violation.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Detect whether placing a `childTag` element with the given `candidate` attribute
 * values under `parentRef` would violate a scoped-uniqueness constraint declared on
 * the parent (e.g. two children with the same `name` under one Bay). Schema-driven:
 * reads the parent's `constraints` and compares the candidate's key fields against
 * the existing children the constraint selects.
 *
 * Returns the first violation found, or `null` if the candidate is unique.
 * `excludeId` skips a specific existing child (e.g. the element itself when
 * re-checking after a rename).
 */
export async function findConstraintViolation(
	query: Core.Query<Config>,
	params: {
		parentRef: Scl.Ref<Scl.ElementsOf>
		childTag: string
		candidate: Record<string, string | undefined>
		excludeId?: string
	},
): Promise<ConstraintViolation | null> {
	const { parentRef, childTag, candidate, excludeId } = params

	const constraints = getConstraints(parentRef.tagName).filter(
		(constraint) =>
			(constraint.kind === 'unique' || constraint.kind === 'key') &&
			selectorMatchesTag(constraint, childTag),
	)
	if (constraints.length === 0) return null

	// direct children via the parent's tree (staged-aware: reflects siblings added
	// earlier in the same transaction, unlike the parent record's cached children).
	const tree = await query.any.getTree(parentRef)
	const childNodes = tree?.tree ?? []

	for (const constraint of constraints) {
		const fields = fieldsOf(constraint)
		// the candidate must carry every key field to collide meaningfully
		if (fields.length === 0 || fields.some((field) => candidate[field] === undefined)) continue

		for (const childNode of childNodes) {
			if (childNode.id === excludeId) continue
			if (!selectorMatchesTag(constraint, childNode.tagName)) continue

			if (fields.every((field) => attributeValue(childNode, field) === candidate[field])) {
				return { constraint: constraint.name, fields, offendingId: childNode.id }
			}
		}
	}

	return null
}

function attributeValue(
	node: { attributes: { name: string; value: string }[] },
	name: string,
): string | undefined {
	return node.attributes.find((attribute) => attribute.name === name)?.value
}

function getConstraints(tag: string): SchemaConstraint[] {
	return (
		(DEFINITION as Record<string, { constraints?: SchemaConstraint[] }>)[tag]?.constraints ?? []
	)
}

/** A constraint selects a tag when a selector step is a wildcard or names that tag. */
function selectorMatchesTag(constraint: SchemaConstraint, tag: string): boolean {
	for (const path of constraint.selector ?? []) {
		const last = (path.steps ?? []).at(-1)
		if (!last) continue
		if (last.kind === 'wildcard') return true
		if (last.kind === 'name' && last.value === tag) return true
	}
	return false
}

function fieldsOf(constraint: SchemaConstraint): string[] {
	return (constraint.fields ?? [])
		.map((field) => field.target?.value)
		.filter((value): value is string => Boolean(value))
}
