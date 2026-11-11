import type { LaterBindingAttributes } from '../dataflow.types'

/**
 * Whether the attributes are in the later-binding shape: every required one set, none forbidden, except a forbidden
 * one repeating the value of its expected attribute.
 */
export function isLaterBinding(params: {
	shape: LaterBindingAttributes
	attributes: Readonly<Record<string, string>>
}): boolean {
	const { shape, attributes } = params
	return (
		shape.required.every((name) => Boolean(attributes[name])) &&
		!shape.forbidden.some(
			(name) => Boolean(attributes[name]) && !repeatsExpected({ shape, attributes, name }),
		)
	)
}

/** Whether a forbidden attribute holds exactly the value of the attribute it may repeat. */
function repeatsExpected(params: {
	shape: LaterBindingAttributes
	attributes: Readonly<Record<string, string>>
	name: string
}): boolean {
	const { shape, attributes, name } = params
	const allowed = shape.allowedWhenExpected?.find(({ attribute }) => attribute === name)
	return allowed !== undefined && attributes[name] === attributes[allowed.expected]
}
