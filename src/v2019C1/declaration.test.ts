import packageJson from '../../package.json'
import { SCL_DIALECTE } from './declaration.constants'

import { describe, expect, it } from 'vitest'

describe('the SCL dialecte declaration', () => {
	type TestCase = {
		only?: boolean
		read: () => unknown
		expected: unknown
	}

	const testCases: Record<string, TestCase> = {
		'its id → scl/v2019C1, the id stored with each SQLite project': {
			read: () => SCL_DIALECTE.id,
			expected: 'scl/v2019C1',
		},
		'its version → the package version': {
			read: () => SCL_DIALECTE.version,
			expected: packageJson.version,
		},
		'its hooks → the import session and every record hook': {
			read: () => Object.keys(SCL_DIALECTE.createHooks()).sort(),
			expected: [
				'afterCreated',
				'afterDelete',
				'afterStandardizedRecord',
				'afterUpdated',
				'beforeClone',
				'beforeCommit',
				'beforeDelete',
				'createImportSession',
			],
		},
		'its hooks → a new instance each call, no state shared between projects or engines': {
			read: () => SCL_DIALECTE.createHooks() === SCL_DIALECTE.createHooks(),
			expected: false,
		},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, async () => {
			// read inside the promise: a declaration that throws fails the assertion, not the test around it
			await expect(new Promise((resolve) => resolve(testCase.read()))).resolves.toEqual(
				testCase.expected,
			)
		})
	})
})
