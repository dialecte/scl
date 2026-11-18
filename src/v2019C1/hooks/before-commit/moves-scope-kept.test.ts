import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('a reference named in its scope stays bound when the scope moves with it', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// the Application A1 holds the role R1, its variant reference, and the variant FV1 it names
		'the application A1 moved from S1 to S2 → its variant reference still names FV1': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="s1" name="S1">
						<Private ${id}="s1-applications" type="eIEC61850-6-100">
							<eIEC61850-6-100:Application ${id}="a1" name="A1">
								<eIEC61850-6-100:FunctionRole ${id}="r1" name="R1">
									<eIEC61850-6-100:FunctionalVariantRef ${id}="variant-ref" functionalVariant="FV1" functionalVariantUuid="fv1" />
									<eIEC61850-6-100:FunctionRoleContent ${id}="content" />
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:FunctionalVariant ${id}="fv1" name="FV1" uuid="fv1" />
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
					<Substation ${id}="s2" name="S2">
						<Private ${id}="s2-applications" type="eIEC61850-6-100">
							<eIEC61850-6-100:Application ${id}="a2" name="A2">
								<eIEC61850-6-100:FunctionRole ${id}="r2" name="R2">
									<eIEC61850-6-100:FunctionRoleContent ${id}="other-content" />
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:Substation[@name="S2"]//v2019C1:Application[@name="A1"]//v2019C1:FunctionalVariantRef[@functionalVariant="FV1"][@functionalVariantUuid="fv1"]',
			],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveTheApplication(tx) {
			await tx.any.move(
				{ tagName: 'Application', id: 'a1' },
				{ parent: { tagName: 'Private', id: 's2-applications' } },
			)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
