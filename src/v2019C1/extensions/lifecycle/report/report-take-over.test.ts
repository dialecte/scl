import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { TakeOver } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const iedRef = { tagName: 'IED', id: 'source-ied' } as const satisfies Scl.Ref<'IED'>
const projectRoot = { tagName: 'SCL', id: 'project-root' } as const satisfies Scl.Ref<'SCL'>

/** A template ISD holding the IED SPECIFICATION and nothing else. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="source-root">
		<IED name="SPECIFICATION" uuid="20000000-0000-4000-8000-000000000001" ${id}="source-ied">
			<AccessPoint name="AP1"/>
		</IED>
	</SCL>
`

/** A project holding one value of its own, in an IED of its own. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project-root">
		<IED name="IED7" uuid="30000000-0000-4000-8000-000000000001" ${id}="ied-t">
			<AccessPoint name="AP1" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="ln0-t">
							<DOI name="Mod" ${id}="mod-t">
								<DAI name="ctlModel" ${id}="ctl-dai-t"><Val ${id}="ctl-t">status-only</Val></DAI>
							</DOI>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
		</DataTypeTemplates>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	takeOver: TakeOver[]
	expected: { refused: { key: string | undefined; meta: unknown } }
}

// A take-over names a value the project keeps against the template: one the report lists no such value for is refused
describe('query.lifecycle.report - a take-over of a value the report does not keep', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a value of an IED the report does not compare → refused, naming it': {
			sourceXml,
			targetXml: projectXml,
			takeOver: [{ element: { tagName: 'Val', id: 'ctl-t' } }],
			expected: {
				refused: {
					key: 'TAKE_OVER_NOT_OFFERED',
					meta: { element: { tagName: 'Val', id: 'ctl-t' } },
				},
			},
		},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'P1.isd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const sourceFile = project.openDocument(imported.documentId)
		const outcome = await target.query.lifecycle
			.report({
				verb: 'ied',
				sourceQuery: sourceFile.query,
				ref: iedRef,
				anchor: projectRoot,
				resolution: { takeOver: testCase.takeOver },
			})
			.then(
				function reported() {
					return { refused: { key: undefined, meta: undefined } }
				},
				function refusal(error: unknown) {
					const refused = toDialecteError(error)
					return { refused: { key: refused?.key, meta: refused?.meta } }
				},
			)
		expect(outcome).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
