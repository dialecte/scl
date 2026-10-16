import type { LaterBindingAttributes } from '../dataflow.types'

/** Whether the attributes are in the later-binding shape: every required one set, none forbidden. */
export function isLaterBinding(params: {
	shape: LaterBindingAttributes
	attributes: Readonly<Record<string, string>>
}): boolean {
	const { shape, attributes } = params
	return (
		shape.required.every((name) => Boolean(attributes[name])) &&
		!shape.forbidden.some((name) => Boolean(attributes[name]))
	)
}
