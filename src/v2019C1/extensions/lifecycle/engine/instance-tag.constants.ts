/**
 * The elements that only exist in a template, and the element each becomes once instantiated: a
 * function template has no parent level and is placed as a function, wherever it is placed.
 */
export const INSTANCE_TAGS: Readonly<Record<string, string>> = {
	FunctionTemplate: 'Function',
	SubFunctionTemplate: 'SubFunction',
}

/** The element each function is written as in a template with no parent level: the reverse of {@link INSTANCE_TAGS}. */
export const TEMPLATE_TAGS: Readonly<Record<string, string>> = Object.fromEntries(
	Object.entries(INSTANCE_TAGS).map(([template, instance]) => [instance, template]),
)
