/// <reference types="vite/client" />

/**
 * Every SCL fixture file of the package, by its path: what a test imports as a `?raw` document, whatever helper (or
 * none) it is imported through. The generated stress files and the real-file corpus (git-ignored, synced or built per
 * machine) are left out.
 */
export const SCL_FIXTURE_FILES: Readonly<Record<string, string>> = import.meta.glob<string>(
	[
		'../**/fixtures/**/*.{xml,scd,ssd,icd,isd,iid,fsd,asd,cid,sed}',
		'!./fixtures/data/**',
		'!./fixtures/corpus/**',
	],
	{ query: '?raw', import: 'default', eager: true },
)

/** The fixture files that are first-edition files on purpose, their root stating no SCL version, each with why. */
export const FIRST_EDITION_FIXTURE_FILES: Readonly<Record<string, string>> = {}

/**
 * The fixture files whose root carries the eIEC61850-6-100 namespace without stating its version on purpose, each with
 * why.
 */
export const EXTENSION_VERSIONLESS_FIXTURE_FILES: Readonly<Record<string, string>> = {
	'./fixtures/written-extension-version/an-lnode-named-by-the-extension-its-root-without-the-extension-version.xml':
		'the root lacks the extension version the write is to state',
}
