import { readRevisionTwin } from './revision-twins'
import { REVISION_TWINS } from './revision-twins.constants'

import { describe, expect, it } from 'vitest'

import { collectSclOutputViolations, createSclTestProject } from '@/v2019C1/test'

import type { RevisionTwin } from './revision-twins.types'

const HEADER = /<Header\b[^>]*\buuid="([^"]+)"[^>]*\brevision="([^"]+)"/

describe('revision twins', () => {
	const twins = Object.keys(REVISION_TWINS) as RevisionTwin[]

	it.each(twins)('%s: both revisions are files a real file could be', async (twin) => {
		for (const revision of [1, 2] as const) {
			const { project, source } = await createSclTestProject({
				sourceXml: readRevisionTwin({ twin, revision }),
			})
			const report = await collectSclOutputViolations({
				project,
				document: source.document,
				asTestDocument: false,
			})
			expect(report.violations, `${twin} revision ${revision}`).toEqual([])
		}
	})

	it.each(twins)('%s: the second revision is the same file, one revision on', (twin) => {
		const [, firstUuid, firstRevision] = HEADER.exec(readRevisionTwin({ twin, revision: 1 })) ?? []
		const [, secondUuid, secondRevision] =
			HEADER.exec(readRevisionTwin({ twin, revision: 2 })) ?? []
		expect(firstUuid).toBeDefined()
		expect(secondUuid).toBe(firstUuid)
		expect([firstRevision, secondRevision]).toEqual(['1', '2'])
	})
})
