/**
 * The elements an FSD template file is instantiated from: a `Function` placed at a level of the template, or a
 * `FunctionTemplate` — a function with no parent level, which is instantiated as a function too.
 */
export const FSD_PLACEABLE_ROOT_TAGS = ['Function', 'FunctionTemplate'] as const
