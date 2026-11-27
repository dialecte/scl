import { FIRST_EDITION_FIXTURE_FILES, SCL_FIXTURE_FILES } from './fixture-files-edition.constants'
import { missingSclEdition } from './fixture-root'

import { describe, expect, it } from 'vitest'

// Every SCL fixture file states the SCL edition of its root, version, revision and release, as every current file does,
// whatever helper a test imports it through: a root stating no version is a first-edition file, listed on purpose with
// the reason; a root stating its version states its revision and release too, always.
describe('the SCL fixture files of the package', () => {
	const missing = Object.entries(SCL_FIXTURE_FILES).map(function missingOf([path, xml]) {
		return { path, missing: missingSclEdition({ xml }) ?? [] }
	})

	it('each root states its SCL version, but the first-edition files listed with their reason', () => {
		const withoutVersion = missing
			.filter((file) => file.missing.includes('version'))
			.map((file) => file.path)
		expect(withoutVersion).toEqual(Object.keys(FIRST_EDITION_FIXTURE_FILES))
	})

	it('each root stating its version states its revision and release', () => {
		const partial = missing
			.filter((file) => file.missing.length > 0 && !file.missing.includes('version'))
			.map((file) => `${file.path} lacks ${file.missing.join(', ')}`)
		expect(partial).toEqual([])
	})
})
