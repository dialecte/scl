/**
 * Reads one attribute value from a list of attributes as held: a clone mapping's source (another document, so
 * `query.getAttributes` does not apply) or a staged record. Absent → `undefined`.
 */
export function cloneAttributeValue(params: {
	attributes: readonly { name: string; value: string }[]
	name: string
}): string | undefined {
	const { attributes, name } = params
	return attributes.find((attribute) => attribute.name === name)?.value
}
