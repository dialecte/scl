/// <reference types="vite/client" />
import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

/** The case's document is the project holding the placed template; the template is opened beside it. */
type UpdateTestCase = SclTest.BaseXmlTestCase & { templateXml: string }

/**
 * An update of a placed bay compares it with its template: a terminal of the template naming a node the template does
 * not hold, left out when the bay was placed, is not added by the update either.
 */
describe('apply - an update of a bay whose terminals name what the template does not hold', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		"a placed bay, its breaker and its function's breaker on nodes of a bay the template does not hold → neither terminal added":
			{
				sourceXml: FIXTURES['./fixtures/bay-with-terminals-on-a-bay-not-held-placed.xml'],
				templateXml: FIXTURES['./fixtures/bay-with-terminals-on-a-bay-not-held.xml'],
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
		const update = {
			verb: 'ssd' as const,
			scenario: 'template' as const,
			sourceQuery: template.query,
			ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
			anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
		}
		const reported = await report(source.query, update)
		await source.transaction(async function write(tx) {
			await apply(tx, { ...update, report: reported, resolution: { decisions: new Map() } })
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
