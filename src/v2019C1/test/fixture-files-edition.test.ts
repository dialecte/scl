import { FIRST_EDITION_FIXTURE_FILES, SCL_FIXTURE_FILES } from './fixture-files-edition.constants'
import { statesNoSclVersion } from './fixture-root'

import { describe, expect, it } from 'vitest'

// Every SCL fixture file states the SCL edition of its root, as every current file does, whatever helper a test imports
// it through: a root stating no version is a first-edition file, listed on purpose with the reason.
describe('the SCL fixture files of the package', () => {
	it('each root states its SCL version, but the first-edition files listed with their reason', () => {
		const withoutVersion = Object.entries(SCL_FIXTURE_FILES)
			.filter(([, xml]) => statesNoSclVersion({ xml }))
			.map(([path]) => path)
		expect(withoutVersion).toEqual(Object.keys(FIRST_EDITION_FIXTURE_FILES))
	})
})
