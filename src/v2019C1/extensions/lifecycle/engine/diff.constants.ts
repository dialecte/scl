/**
 * Instance-only metadata the lifecycle pipeline itself creates (naming and provenance): never classified as
 * `target-only` (it would then surface as a spurious "keep/remove" decision and could be deleted). It is the
 * engine's own: the elements a consumer maintains on instances are the consumer's to name
 * (`Resolution.consumerManagedTags`), the engine knows none by default.
 * The transparent `Private` wrapper is unwrapped so genuine author children inside it
 * (e.g. a `DOS`) are still classified.
 */
export const ENGINE_MANAGED_TAGS = new Set<string>([
	'LNodeSpecNaming',
	'FunctionSclRef',
	'ApplicationSclRef',
	'SclFileReference',
])
