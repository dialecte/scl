import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const P2_LD = { tagName: 'LDevice', id: 'p2-ld' } as const

const NEW_LN = {
	prefix: 'Q1',
	lnClass: 'XCBR',
	inst: '1',
	lnType: 'XCBR_T',
	uuid: 'new-ln-uuid',
}

// A reference whose names already agree with its target, and an LNode (whose binding writes its names), get no update.
describe('the commit stages no update for a reference that already reads right', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The element the transaction adds below the first element of its parent tag. */
		created: {
			parent: Scl.Ref<Scl.ElementsOf>
			tagName: Scl.ElementsOf
			attributes: Record<string, string>
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'ConnectedAP naming an access point by uuid and by the same names, the access point created → no update':
			{
				allowIncoherentReferences: 'the access point the ConnectedAP names is created by the case',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Header id="project"/>
						<Communication ${id}="communication">
							<SubNetwork ${id}="subnetwork" name="W1">
								<ConnectedAP ${id}="connected-ap" iedName="P2" apName="AP2" apUuid="p2-ap2-uuid"/>
							</SubNetwork>
						</Communication>
						<IED ${id}="p2" name="P2">
							<AccessPoint ${id}="p2-ap" name="AP1"/>
						</IED>
					</SCL>`,
				created: {
					parent: { tagName: 'IED', id: 'p2' },
					tagName: 'AccessPoint',
					attributes: { name: 'AP2', uuid: 'p2-ap2-uuid' },
				},
				expectedQueries: [
					'//default:ConnectedAP[@apUuid="p2-ap2-uuid"][@iedName="P2"][@apName="AP2"]',
				],
			},
		'LNode naming a logical node by uuid, the logical node created → no update, its binding writes its names':
			{
				allowIncoherentReferences: 'the logical node the LNode names is created by the case',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Header id="project"/>
						<Substation ${id}="substation" name="S1">
							<Function ${id}="function" name="F1">
								<LNode ${id}="lnode" iedName="None" lnClass="XCBR" lnInst="1" lnUuid="new-ln-uuid"/>
							</Function>
						</Substation>
						<IED ${id}="p2" name="P2">
							<AccessPoint ${id}="p2-ap" name="AP1">
								<Server ${id}="p2-server">
									<LDevice ${id}="p2-ld" inst="LD0"/>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>`,
				created: { parent: P2_LD, tagName: 'LN', attributes: NEW_LN },
				expectedQueries: ['//default:LNode[@iedName="None"][@lnUuid="new-ln-uuid"][not(@prefix)]'],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { parent, tagName, attributes } = testCase.created
		await source.transaction(async (tx) => {
			await tx.any.addChild(parent, { tagName, attributes })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
