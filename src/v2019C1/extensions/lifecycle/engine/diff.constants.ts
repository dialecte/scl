/**
 * Instance-only metadata the lifecycle pipeline itself creates (naming + provenance) or
 * tool-generated structural grouping, NOT author content. These must never be classified
 * as `target-only` (they would then surface as spurious "keep/remove" decisions and could
 * be deleted). `FunctionRole`/`FunctionRoleContent` are a consumer's application-assignment
 * grouping — created from scratch (no `templateUuid`) and re-derived
 * idempotently, so they are reconciled structurally, never offered for author-removal.
 * The transparent `Private` wrapper is unwrapped so genuine author children inside it
 * (e.g. a `DOS`) are still classified.
 */
export const ENGINE_MANAGED_TAGS = new Set<string>([
	'LNodeSpecNaming',
	'FunctionSclRef',
	'ApplicationSclRef',
	'SclFileReference',
	'FunctionRole',
	'FunctionRoleContent',
])
