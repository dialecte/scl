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

/** The case's document is the project holding the placed template; the newer template is opened beside it. */
type UpdateTestCase = SclTest.BaseXmlTestCase & { templateXml: string }

/**
 * An update writes the roles a template gains where its report says, resolved before anything is written: the role it
 * created for one application is not what another application's new role of the same name maps onto.
 */
describe('update.ssd - a role the template gains lands in the bay that holds it', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'two placed bays, the template gives each a new role "BAY_CTRL" → each role written in its own bay, under its own name':
			{
				sourceXml: FIXTURES['./fixtures/two-bays-placed.xml'],
				templateXml: FIXTURES['./fixtures/two-bays-each-gaining-a-role.xml'],
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Private/v2019C1:AllocationRole[@name="BAY_CTRL"][@templateUuid="bay-ctrl-1-source-uuid"]',
					'//default:Bay[@name="B2"]/default:Private/v2019C1:AllocationRole[@name="BAY_CTRL"][@templateUuid="bay-ctrl-2-source-uuid"]',
				],
				// both written in the substation's Private, the second was numbered
				unexpectedQueries: ['//v2019C1:AllocationRole[@name="BAY_CTRL_1"]'],
			},
	}

	async function act(params: SclTest.ActParams<UpdateTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
		})
		const update = {
			verb: 'ssd' as const,
			scenario: 'template' as const,
			sourceQuery: template.query,
			ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
			anchor: { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>,
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
