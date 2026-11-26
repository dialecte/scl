import {
	EXTENSION_VERSIONLESS_FIXTURE_FILES,
	SCL_FIXTURE_FILES,
} from './fixture-files-edition.constants'
import { lacksExtensionVersion } from './given-extension-version'

import { describe, expect, it } from 'vitest'

// Every SCL fixture file carrying the eIEC61850-6-100 namespace states the extension's version on its root, whatever
// helper a test imports it through: one that does not is listed on purpose with the reason.
describe('the SCL fixture files of the package, carrying the eIEC61850-6-100 namespace', () => {
	it('each root states the extension version, but the files listed with their reason', () => {
		const withoutExtensionVersion = Object.entries(SCL_FIXTURE_FILES)
			.filter(([, xml]) => lacksExtensionVersion({ xml }))
			.map(([path]) => path)
		expect(withoutExtensionVersion).toEqual(Object.keys(EXTENSION_VERSIONLESS_FIXTURE_FILES))
	})
})
