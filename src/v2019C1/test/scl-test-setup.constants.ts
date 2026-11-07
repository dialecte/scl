/**
 * How long the check of a runner call's fixtures may take before its first case runs: each fixture is imported into
 * a test project of its own, a few milliseconds each in node, more on a browser's store under load.
 */
export const FIXTURE_REFERENCES_CHECK_TIMEOUT_MS = 120_000

/**
 * How long a case through an SCL engine worker may take: the worker starts, opens its database on the origin's private
 * file system and imports, on a loaded machine (a second or two when quiet).
 */
export const ENGINE_LEG_TIMEOUT_MS = 60_000
