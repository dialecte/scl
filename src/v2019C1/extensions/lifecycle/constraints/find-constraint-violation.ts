import type { ConstraintScope, ConstraintViolation } from './find-constraint-violation.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Detect whether placing a `childTag` element with the given `candidate` attribute
 * values under `parentRef` would violate a scoped-uniqueness constraint declared on
 * the parent (e.g. two children with the same `name` under one Bay). Schema-driven:
 * reads the parent's `constraints` as declared where the parent sits (one tag may carry
 * different rules under different parents) and compares the candidate's key fields
 * against the existing children the constraint selects.
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
	const scope = await readConstraintScope(query, { parentRef, childTag })
	return findViolationInScope({ scope, candidate, excludeId })
}

/**
 * What a `childTag` placed under `parentRef` is compared with: the uniqueness constraints that
 * select it, as declared where the parent sits, and the parent's children. Read once, then any
 * number of candidates is checked in memory with {@link findViolationInScope}.
 */
export async function readConstraintScope(
	query: Core.Query<Config>,
	params: { parentRef: Scl.Ref<Scl.ElementsOf>; childTag: string },
): Promise<ConstraintScope> {
	const { parentRef, childTag } = params

	const parentDefinition = await query.getDefinition(parentRef)
	const constraints = (parentDefinition?.constraints ?? []).filter(
		(constraint) =>
			(constraint.kind === 'unique' || constraint.kind === 'key') &&
			fieldsOf(constraint).length > 0 &&
			selectsChild({ constraint, tag: childTag }),
	)
	if (constraints.length === 0) return { constraints, children: [] }

	// direct children via the parent's tree (staged-aware: reflects siblings added earlier in the
	// same transaction, unlike the parent record's cached children)
	const tree = await query.any.getTree(parentRef)
	return { constraints, children: tree?.tree ?? [] }
}

/** The first constraint of `scope` the `candidate` breaks, or `null`. Pure. */
export function findViolationInScope(params: {
	scope: ConstraintScope
	candidate: Record<string, string | undefined>
	excludeId?: string
}): ConstraintViolation | null {
	const { scope, candidate, excludeId } = params

	for (const constraint of scope.constraints) {
		const fields = fieldsOf(constraint)
		// the candidate must carry every key field to collide meaningfully
		if (fields.length === 0 || fields.some((field) => candidate[field] === undefined)) continue

		for (const selected of selectedBy({ constraint, children: scope.children })) {
			if (selected.id === excludeId) continue
			if (fields.every((field) => attributeValue(selected, field) === candidate[field])) {
				return { constraint: constraint.name, fields, offendingId: selected.id }
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

/**
 * Whether a constraint selects a child placed directly under the element it is declared on: a selector path of one
 * step, from the element itself (not `.//`), whose name test admits its tag. A longer path selects deeper elements
 * only; a `.//` path makes the constraint document-wide (`uniqueUUID` on `SCL`) - a placement does not rename for
 * it, validation checks it. The namespace is left to the elements compared.
 */
function selectsChild(params: { constraint: Core.IdentityConstraint; tag: string }): boolean {
	const { constraint, tag } = params
	return childPaths(constraint).some(
		(path) => path.steps[0]?.name === undefined || path.steps[0]?.name === tag,
	)
}

/** The children of the parent a constraint's child paths select: those whose name and namespace the step admits. */
function selectedBy(params: {
	constraint: Core.IdentityConstraint
	children: readonly Core.AnyTreeRecord[]
}): Core.AnyTreeRecord[] {
	const { constraint, children } = params
	return children.filter((node) =>
		childPaths(constraint).some((path) => {
			const [step] = path.steps
			const nameMatches = step?.name === undefined || step.name === node.tagName
			const namespaceMatches =
				step?.namespace === undefined || step.namespace === node.namespace.uri
			return nameMatches && namespaceMatches
		}),
	)
}

/** The selector paths of a constraint that reach the children of the element it is declared on. */
function childPaths(constraint: Core.IdentityConstraint): Core.IdentityConstraint['selector'] {
	return constraint.selector.filter((path) => path.steps.length === 1 && !path.deep)
}

/**
 * The attributes a constraint compares, one per field: a field whose every alternative reads the same attribute in
 * no namespace of the selected element itself. Any other field - an element's text, a deeper path - leaves the
 * constraint out of these comparisons: none is returned.
 */
function fieldsOf(constraint: Core.IdentityConstraint): string[] {
	const names = constraint.fields.map((alternatives) => {
		const read = alternatives.map((path) =>
			path.steps.length === 0 && path.attribute?.namespace === '' ? path.attribute.name : undefined,
		)
		const [first] = read
		return first !== undefined && read.every((name) => name === first) ? first : undefined
	})
	return names.every((name): name is string => name !== undefined) ? names : []
}
