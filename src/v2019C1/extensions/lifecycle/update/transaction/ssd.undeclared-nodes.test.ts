/// <reference types="vite/client" />
import { ssd as updateSsd } from './ssd'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of the apply tests, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>(
	'../../apply/fixtures/*.xml',
	{
		query: '?raw',
		import: 'default',
		eager: true,
	},
)

/** The case's document is the project holding the placed template; the template is opened beside it. */
type UpdateTestCase = SclTest.BaseXmlTestCase & { templateXml: string }

/**
 * An update called on its own, with no report to gate it, writes what the report would: a terminal naming a node the
 * template does not hold is not added.
 */
describe('update.ssd - a bay whose terminals name what the template does not hold, updated with no report', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		"a placed bay, its breaker and its function's breaker on nodes of a bay the template does not hold → neither terminal added":
			{
				sourceXml: FIXTURES['../../apply/fixtures/bay-with-terminals-on-a-bay-not-held-placed.xml'],
				templateXml: FIXTURES['../../apply/fixtures/bay-with-terminals-on-a-bay-not-held.xml'],
				expectedQueries: [
					'//default:Bay[@name="Bay_MV"]/default:ConductingEquipment[@name="CBR1"]',
					'//default:Function[@name="Prot"]/default:ConductingEquipment[@name="CBR2"]',
				],
				unexpectedQueries: ['//default:Terminal'],
			},
	}

	async function act(params: SclTest.ActParams<UpdateTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
			allowIncoherentReferences: 'the breakers name nodes of a bay the template does not hold',
		})
		await source.transaction(async function write(tx) {
			await updateSsd(tx, {
				sourceQuery: template.query,
				scopeRef: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
				scenario: 'template',
			})
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
