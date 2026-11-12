import { all } from './all'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & { expectedSignals: readonly string[] }

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

describe('dataflow reads the extension content of a Private', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'signal of an LNode in a function template held by a Private → listed': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="root">
					<Private type="eIEC61850-6-100" ${ID}="templates">
						<eIEC61850-6-100:FunctionTemplate name="F1" uuid="40000000-0000-4000-8000-000000000001" ${ID}="template">
							<eIEC61850-6-100:LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_Type" uuid="40000000-0000-4000-8000-000000000002" ${ID}="template-lnode">
								<eIEC61850-6-100:LNodeInputs ${ID}="inputs">
									<eIEC61850-6-100:SourceRef input="Trip" ${ID}="template-signal"/>
								</eIEC61850-6-100:LNodeInputs>
							</eIEC61850-6-100:LNode>
						</eIEC61850-6-100:FunctionTemplate>
					</Private>
				</SCL>`,
			expectedSignals: ['template-signal'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const dataflows = await all(source.query)
		const signals = dataflows.flatMap((dataflow) =>
			dataflow.kind === 'specified' ? [dataflow.signal.id] : [],
		)
		expect(signals).toEqual(testCase.expectedSignals)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
