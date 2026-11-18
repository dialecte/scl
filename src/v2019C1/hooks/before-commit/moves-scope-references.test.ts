import aFunctionWithAResource from './fixtures/a-function-with-a-resource-and-a-behaviour.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	element: Scl.Ref<Scl.ElementsOf>
	parent: Scl.Ref<Scl.ElementsOf>
}

async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	await source.transaction(async function move(tx) {
		await tx.any.move(testCase.element, { parent: testCase.parent })
	})
	return { assertOn: 'source' }
}

const PTRC1 = { tagName: 'LNode', id: 'ptrc1' } as Scl.Ref<Scl.ElementsOf>

describe('a reference named from its own place keeps what its new place still names, and loses the rest', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		// PTRC1 stays in F1, which holds PR1 and the behaviour BD1 naming PTRC1 from F1 down
		'PTRC1 moved from SF1 to SF2 of the same function → the behaviour of F1 names it from SF2, the resource kept':
			{
				sourceXml: aFunctionWithAResource,
				element: PTRC1,
				parent: { tagName: 'SubFunction', id: 'sf2' },
				expectedQueries: [
					'//v2019C1:InputVar[@varName="in1"][@dataName="SF2/PTRC1.Op.general"][@lnodeUuid="ln-ptrc"][@doName="Op"][@daName="general"]',
					'//default:SubFunction[@name="SF2"]/default:LNode[@lnClass="PTRC"]//v2019C1:SourceRef[@input="Trip"][@resourceName="PR1"][@resourceUuid="pr1"]',
					'//v2019C1:SubscriberLNode[@resourceName="PR1"][@resourceUuid="pr1"]',
				],
			},
		// F2 holds no process resource and no behaviour; BD2 moves with PTRC1
		'PTRC1 moved to F2 → its input loses PR1 and stays, read by its own behaviour; its subscriber and the behaviour of F1 lose it':
			{
				sourceXml: aFunctionWithAResource,
				element: PTRC1,
				parent: { tagName: 'Function', id: 'f2' },
				expectedQueries: [
					'//default:Function[@name="F2"]/default:LNode[@lnClass="PTRC"]//v2019C1:SourceRef[@input="Trip"][@uuid="sr1"][not(@resourceName)][not(@resourceUuid)]',
					'//default:Function[@name="F2"]/default:LNode[@lnClass="PTRC"]//v2019C1:InputVar[@varName="in2"][@inputName="Trip"][@inputUuid="sr1"]',
					'//default:Function[@name="F1"]//v2019C1:InputVar[@varName="in1"][not(@lnodeUuid)][not(@dataName)][not(@doName)][not(@daName)]',
					'//v2019C1:DOS[@name="Op"]',
				],
				unexpectedQueries: ['//v2019C1:SubscriberLNode'],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a variant reference keeps the variant only within its application', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		// the role R1 of A1 names the variant FV1 of A1 (A1 keeps its role R0); A2 holds no FV1
		'the role R1 moved from A1 to A2 → its variant reference goes': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Private ${id}="applications" type="eIEC61850-6-100">
							<eIEC61850-6-100:Application ${id}="a1" name="A1">
								<eIEC61850-6-100:FunctionRole ${id}="r0" name="R0">
									<eIEC61850-6-100:FunctionRoleContent ${id}="kept-content" />
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:FunctionRole ${id}="r1" name="R1">
									<eIEC61850-6-100:FunctionalVariantRef ${id}="variant-ref" functionalVariant="FV1" functionalVariantUuid="fv1" />
									<eIEC61850-6-100:FunctionRoleContent ${id}="content" />
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:FunctionalVariant ${id}="fv1" name="FV1" uuid="fv1" />
							</eIEC61850-6-100:Application>
							<eIEC61850-6-100:Application ${id}="a2" name="A2">
								<eIEC61850-6-100:FunctionRole ${id}="r2" name="R2">
									<eIEC61850-6-100:FunctionRoleContent ${id}="other-content" />
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:FunctionalVariant ${id}="other" name="OTHER" uuid="other" />
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			element: { tagName: 'FunctionRole', id: 'r1' },
			parent: { tagName: 'Application', id: 'a2' },
			expectedQueries: [
				'//v2019C1:Application[@name="A2"]/v2019C1:FunctionRole[@name="R1"]/v2019C1:FunctionRoleContent',
			],
			unexpectedQueries: ['//v2019C1:FunctionalVariantRef'],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})
