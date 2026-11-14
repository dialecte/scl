import { unlockLNode } from './unlock-lnode'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * `lnode-real` is bound to R1's Q0CILO4 (R1 from an ICD file) and specified on S1's CTRL/CILO1 (S1 a specification
 * IED); `lnode-on-s1` is bound to S1's CTRL/CSWI1, the logical node it is specified on.
 */
const project = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode-real" iedName="R1" ldInst="LD0" prefix="Q0" lnClass="CILO" lnInst="4" lnUuid="r1-cilo-uuid" uuid="lnode-real-uuid">
					<Private ${id}="lnode-real-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="lnode-real-naming" sIedName="S1" sLdInst="CTRL" sLnClass="CILO" sLnInst="1"/>
					</Private>
				</LNode>
				<LNode ${id}="lnode-on-s1" iedName="S1" ldInst="CTRL" prefix="" lnClass="CSWI" lnInst="1" lnUuid="s1-cswi-uuid" uuid="lnode-on-s1-uuid">
					<Private ${id}="lnode-on-s1-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="lnode-on-s1-naming" sIedName="S1" sLdInst="CTRL" sLnClass="CSWI" sLnInst="1"/>
					</Private>
				</LNode>
			</Function>
		</Substation>
		<IED ${id}="s1" name="S1">
			<AccessPoint ${id}="s1-ap" name="AP1"><Server ${id}="s1-server"><LDevice ${id}="s1-ld" inst="CTRL">
				<LN ${id}="s1-cswi" prefix="" lnClass="CSWI" inst="1" lnType="CSWI_T" uuid="s1-cswi-uuid"/>
				<LN ${id}="s1-cilo" prefix="" lnClass="CILO" inst="1" lnType="CILO_T" uuid="s1-cilo-uuid"/>
			</LDevice></Server></AccessPoint>
		</IED>
		<IED ${id}="r1" name="R1">
			<IEDSourceFiles ${id}="r1-source-files"><SclFileReference ${id}="r1-icd" fileType="ICD"/></IEDSourceFiles>
			<AccessPoint ${id}="r1-ap" name="AP1"><Server ${id}="r1-server"><LDevice ${id}="r1-ld" inst="LD0">
				<LN ${id}="r1-cilo" prefix="Q0" lnClass="CILO" inst="4" lnType="CILO_T" uuid="r1-cilo-uuid"/>
			</LDevice></Server></AccessPoint>
		</IED>
	</SCL>
`

describe('unlockLNode goes back to the specification IED an LNode is specified on', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnode: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode bound to a real IED, specified on a specification IED holding its logical node -> bound to that logical node':
			{
				sourceXml: project,
				lnode: 'lnode-real',
				expectedQueries: [
					'//default:LNode[@uuid="lnode-real-uuid"][@iedName="S1"][@ldInst="CTRL"][@lnClass="CILO"][@lnInst="1"][@lnUuid="s1-cilo-uuid"]',
				],
			},

		'an LNode bound to the specification IED it is specified on -> on no IED': {
			sourceXml: project,
			lnode: 'lnode-on-s1',
			expectedQueries: [
				'//default:LNode[@uuid="lnode-on-s1-uuid"][@iedName="None"][@ldInst="CTRL"][not(@lnUuid)]',
				'//default:LNode[@uuid="lnode-on-s1-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"]',
			],
		},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await unlockLNode(tx, { lnode: { tagName: 'LNode', id: testCase.lnode } })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
