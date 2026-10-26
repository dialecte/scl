import { findIdentityCollision } from './find-identity-collision'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A logical node zero holding `content` in a data object. */
function dataObjectWith(content: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<IED name="P1" ${id}="ied">
				<AccessPoint name="AP1" ${id}="access-point">
					<Server ${id}="server">
						<Authentication ${id}="authentication"/>
						<LDevice inst="LD0" ${id}="logical-device">
							<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="ln0">
								<DOI name="Mod" ${id}="doi">
									${content}
								</DOI>
							</LN0>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
		</SCL>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	ref: Scl.Ref<Scl.ElementsOf>
	/** The collision found; absent: none. */
	expected?: { constraint: string; collidesWith: { tagName: string; id: string } }
}

describe('findIdentityCollision — a collision nothing numbered can tell apart', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two data attributes of one name and index: their key has a name, numbering tells them apart -> none':
			{
				sourceXml: dataObjectWith(
					`<DAI name="stVal" ix="1" ${id}="dai-0"/><DAI name="stVal" ix="1" ${id}="dai-1"/>`,
				),
				ref: { tagName: 'DAI', id: 'dai-1' } as Scl.Ref<Scl.ElementsOf>,
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const collision = await findIdentityCollision(source.query, { ref: testCase.ref })
		expect(collision).toEqual(testCase.expected)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
