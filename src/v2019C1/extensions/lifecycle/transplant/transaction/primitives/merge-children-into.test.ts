import { mergeChildrenInto } from './merge-children-into'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('mergeChildrenInto — recursive name-keyed container reuse', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		source: Scl.Ref<Scl.ElementsOf>
		target: Scl.Ref<Scl.ElementsOf>
	}

	const act = async ({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> => {
		if (!target) throw new Error('target required')
		await target.transaction(async (tx) => {
			await mergeChildrenInto(tx, {
				sourceQuery: source.query,
				source: testCase.source,
				target: testCase.target,
				strip: false,
			})
		})
		return { assertOn: 'target' }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// A second function shares the FunctionCategory "HV Interface" and its SubCategory "Interface",
		// contributing only a new FunctionCatRef. The existing SubCategory must ABSORB the new ref, not
		// be duplicated into a second "Interface" wrapper.
		'nested same-name SubCategory is reused, only the new FunctionCatRef is added': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<Private ${id}="sub-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory ${id}="fcat-src" name="HV Interface" uuid="fcat-src-uuid">
								<eIEC61850-6-100:SubCategory ${id}="scat-src" name="Interface" uuid="scat-src-uuid">
									<eIEC61850-6-100:FunctionCatRef ${id}="fcref-src" function="TEMPLATE/Circuit Breaker_1" functionUuid="cb1-uuid"/>
								</eIEC61850-6-100:SubCategory>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
					</Substation>
				</SCL>
			`,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="target-sub" name="TEMPLATE" uuid="target-sub-uuid">
						<Private ${id}="target-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory ${id}="fcat-tgt" name="HV Interface" uuid="fcat-tgt-uuid">
								<eIEC61850-6-100:SubCategory ${id}="scat-tgt" name="Interface" uuid="scat-tgt-uuid">
									<eIEC61850-6-100:FunctionCatRef ${id}="fcref-tgt" function="TEMPLATE/Circuit Breaker" functionUuid="cb-uuid"/>
								</eIEC61850-6-100:SubCategory>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
					</Substation>
				</SCL>
			`,
			source: { tagName: 'FunctionCategory', id: 'fcat-src' } as Scl.Ref<Scl.ElementsOf>,
			target: { tagName: 'FunctionCategory', id: 'fcat-tgt' } as Scl.Ref<Scl.ElementsOf>,
			expectedQueries: [
				// ONE SubCategory "Interface" that now carries BOTH refs.
				'//v2019C1:SubCategory[@name="Interface"][v2019C1:FunctionCatRef[@function="TEMPLATE/Circuit Breaker"]][v2019C1:FunctionCatRef[@function="TEMPLATE/Circuit Breaker_1"]]',
			],
			unexpectedQueries: [
				// No duplicate "Interface" wrapper.
				'(//v2019C1:SubCategory[@name="Interface"])[2]',
			],
		},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
