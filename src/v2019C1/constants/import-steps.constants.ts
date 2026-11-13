/**
 * The steps the SCL import session reports from `afterImport`, in the order they run: an app maps each to the words
 * it shows. Each one with a count reports `done` out of `total`; `data-types` has none.
 * - `spec-naming`: every LNode given its `LNodeSpecNaming` (counts the LNodes)
 * - `path-index`: every element a reference can name indexed under its path, then under its name in a scope, then
 *   their other paths (counts twice the targets, plus one)
 * - `data-types`: the data type templates indexed (no count)
 * - `path-fills`: the references stored with their uuid only given their path (counts them)
 * - `references`: the references written with a path given their uuid (counts them)
 * - `own-paths`: the attributes an element writes from its own path (counts the elements)
 * - `mapped-data`: the `DOS` / `SDS` / `DAS` mapped data resolved (counts them)
 * - `tuple-references`: the references naming their target by several attributes (counts them)
 */
export const SCL_IMPORT_STEPS = [
	'spec-naming',
	'path-index',
	'data-types',
	'path-fills',
	'references',
	'own-paths',
	'mapped-data',
	'tuple-references',
] as const
