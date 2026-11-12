/// <reference types="vite/client" />
import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleVerb } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of this folder, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

/**
 * The case's document is the project; `placedXml` is placed in it first (in its bay B1, else at `placedAt`), then
 * `templateXml`, its newer revision, updates it from `anchor`.
 */
type UpdateTestCase = SclTest.BaseXmlTestCase & {
	verb: LifecycleVerb
	ref: Scl.Ref<Scl.ElementsOf>
	placedXml: string
	placedAt?: Scl.Ref<Scl.ElementsOf>
	templateXml: string
	anchor: Scl.Ref<Scl.ElementsOf>
}

const terminalOnB1 =
	'//default:ConductingEquipment[@name="QC1"]/default:Terminal[@connectivityNode="S1/15kV/B1/grounded"][@substationName="S1"][@voltageLevelName="15kV"][@bayName="B1"]'

/** An update adding an earth terminal to a function's equipment names the grounded node of the bay the function sits in. */
describe('apply - an update of a function gaining an earthing switch on the predefined grounded node', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'a function placed in B1, its template gaining an earthing switch on the grounded node → the terminal names the grounded node of B1':
			{
				sourceXml: FIXTURES['./fixtures/project-with-bay-b1.xml'],
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'function-s' },
				placedXml: FIXTURES['./fixtures/function-with-a-breaker.xml'],
				templateXml: FIXTURES['./fixtures/function-gaining-an-earthing-switch.xml'],
				anchor: { tagName: 'Bay', id: 'bay-t' },
				expectedQueries: [terminalOnB1],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
		'an application placed in B1, its function gaining an earthing switch on the grounded node → the terminal names the grounded node of B1':
			{
				sourceXml: FIXTURES['./fixtures/project-with-bay-b1.xml'],
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-s' },
				placedXml: FIXTURES['./fixtures/application-with-a-function.xml'],
				templateXml: FIXTURES['./fixtures/application-gaining-an-earthing-switch.xml'],
				anchor: { tagName: 'Bay', id: 'bay-t' },
				expectedQueries: [terminalOnB1],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
		'an application placed in B1, updated from its voltage level, its function gaining an earthing switch → the terminal names the grounded node of B1':
			{
				sourceXml: FIXTURES['./fixtures/project-with-bay-b1.xml'],
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-s' },
				placedXml: FIXTURES['./fixtures/application-with-a-function.xml'],
				templateXml: FIXTURES['./fixtures/application-gaining-an-earthing-switch.xml'],
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				expectedQueries: [terminalOnB1],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
		'a bay placed as Bay_MV, its function gaining an earthing switch on the grounded node → the terminal names the grounded node of Bay_MV':
			{
				sourceXml: FIXTURES['./fixtures/project-with-bay-b1.xml'],
				verb: 'ssd',
				ref: { tagName: 'Substation', id: 'substation-s' },
				placedXml: FIXTURES['./fixtures/bay-with-a-function.xml'],
				placedAt: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				templateXml: FIXTURES['./fixtures/bay-whose-function-gains-an-earthing-switch.xml'],
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				expectedQueries: [
					'//default:ConductingEquipment[@name="QC1"]/default:Terminal[@connectivityNode="S1/15kV/Bay_MV/grounded"][@substationName="S1"][@voltageLevelName="15kV"][@bayName="Bay_MV"]',
				],
				unexpectedQueries: ['//default:Terminal[contains(@connectivityNode, "TEMPLATE")]'],
			},
	}

	async function act(params: SclTest.ActParams<UpdateTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		const placed = await openSclDocument({ project, xml: testCase.placedXml, label: 'template' })
		const placement = {
			verb: testCase.verb,
			scenario: 'instantiate' as const,
			sourceQuery: placed.query,
			ref: testCase.ref,
			anchor: testCase.placedAt ?? ({ tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>),
		} as Parameters<typeof report>[1]
		const placementReport = await report(source.query, placement)
		await source.transaction(async function place(tx) {
			await apply(tx, {
				...placement,
				report: placementReport,
				resolution: { decisions: new Map() },
			})
		})

		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'newer template',
		})
		const update = {
			verb: testCase.verb,
			scenario: 'template' as const,
			sourceQuery: template.query,
			ref: testCase.ref,
			anchor: testCase.anchor,
		} as Parameters<typeof report>[1]
		const updateReport = await report(source.query, update)
		await source.transaction(async function write(tx) {
			await apply(tx, { ...update, report: updateReport, resolution: { decisions: new Map() } })
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
