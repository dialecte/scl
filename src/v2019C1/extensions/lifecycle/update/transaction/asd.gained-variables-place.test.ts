/// <reference types="vite/client" />
import { asd as updateAsd } from './asd'

import { describe } from 'vitest'

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
 * A variable a template gains configures its instance: an update writes it in the level that instance sits in, whatever
 * level the update was started from.
 */
describe('update.asd - a variable the template gains lands in the bay that holds its instance', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'an application placed in B1, updated from its voltage level, the template giving it a variable → written in B1':
			{
				sourceXml: FIXTURES['./fixtures/two-bays-placed.xml'],
				templateXml: FIXTURES['./fixtures/two-bays-each-gaining-an-application-variable.xml'],
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Private/v2019C1:Variable[@name="PICKUP"][@templateUuid="pickup-1-source-uuid"]',
				],
				// none is written above the bays, where the update was started from
				unexpectedQueries: ['//v2019C1:Variable[not(ancestor::default:Bay)]'],
			},
	}

	async function act(params: SclTest.ActParams<UpdateTestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source } = params
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
		})
		await source.transaction(async function write(tx) {
			await updateAsd(tx, {
				sourceQuery: template.query,
				applicationRef: { tagName: 'Application', id: 'application-1-s' } as Scl.Ref<'Application'>,
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
				scenario: 'template',
			})
		})
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
