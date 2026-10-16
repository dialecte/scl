import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * P1 and P2, each with an access point, a logical device and an LN0. P2 holds a GOOSE control block
 * `gcb1` in its LN0, and a logical node `Q0XCBR2` holding a report control block `rcb1`. `inputs`
 * is what P1's LN0 inputs hold, `extras` what follows P2's logical node, `communication` the
 * `Communication` section.
 */
function twoDevices(
	params: { inputs?: string; extras?: string; communication?: string; registrations?: string } = {},
) {
	const { inputs = '', extras = '', communication = '', registrations = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Header id="project"/>
			${communication}
			<IED ${id}="p1" name="P1">
				<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid">
					<Server ${id}="p1-server">
						<LDevice ${id}="p1-ld" inst="LD0" uuid="p1-ld-uuid">
							<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p1-lln0-uuid">
								<Inputs ${id}="p1-inputs">${inputs}</Inputs>
							</LN0>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
			<IED ${id}="p2" name="P2">
				<AccessPoint ${id}="p2-ap" name="AP1" uuid="p2-ap-uuid">
					<Server ${id}="p2-server">
						<LDevice ${id}="p2-ld" inst="LD0" uuid="p2-ld-uuid">
							<LN0 ${id}="p2-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p2-lln0-uuid">
								<GSEControl ${id}="p2-gcb" name="gcb1" appID="gcb1" uuid="p2-gcb-uuid">${registrations}</GSEControl>
							</LN0>
							<LN ${id}="p2-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="p2-breaker-uuid">
								<ReportControl ${id}="p2-rcb" name="rcb1" confRev="1" uuid="p2-rcb-uuid"/>
							</LN>
							${extras}
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
		</SCL>
	`
}

const INPUTS = { tagName: 'Inputs', id: 'p1-inputs' } as const

describe('afterCreated — tuple references', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The element the case adds, below `parent`. */
		create: {
			parent: Scl.Ref<Scl.ElementsOf>
			tagName: Scl.ElementsOf
			attributes: Record<string, string>
		}
		/** The tag of the elements the case must stage no update for: what they name reads the same. */
		notUpdated?: Scl.ElementsOf
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'ExtRef created with the uuid of a GOOSE control block in an LN0 only → the names of its control block written':
			{
				sourceXml: twoDevices(),
				create: {
					parent: INPUTS,
					tagName: 'ExtRef',
					attributes: { srcCBUuid: 'p2-gcb-uuid', serviceType: 'GOOSE', intAddr: 'Pos' },
				},
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@srcLDInst="LD0"][@srcCBName="gcb1"][not(@srcLNClass)]',
				],
			},
		'ExtRef created with the uuid of a report control block of a logical node → the names of that logical node written too':
			{
				sourceXml: twoDevices(),
				create: {
					parent: INPUTS,
					tagName: 'ExtRef',
					attributes: { srcCBUuid: 'p2-rcb-uuid', serviceType: 'Report', intAddr: 'Pos' },
				},
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@srcLDInst="LD0"][@srcPrefix="Q0"][@srcLNClass="XCBR"][@srcLNInst="2"][@srcCBName="rcb1"]',
				],
			},
		'ExtRef created with the uuid of a logical node only → the names of that logical node written':
			{
				sourceXml: twoDevices(),
				create: {
					parent: INPUTS,
					tagName: 'ExtRef',
					attributes: { lnUuid: 'p2-breaker-uuid', doName: 'Pos', intAddr: 'Pos' },
				},
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"][@lnUuid="p2-breaker-uuid"]',
				],
			},
		'ExtRef created with a uuid and names of another logical node → the names of the uuid written':
			{
				sourceXml: twoDevices(),
				create: {
					parent: INPUTS,
					tagName: 'ExtRef',
					attributes: {
						lnUuid: 'p2-breaker-uuid',
						iedName: 'P9',
						ldInst: 'LD9',
						lnClass: 'MMXU',
						lnInst: '7',
						doName: 'Pos',
						intAddr: 'Pos',
					},
				},
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"]',
				],
			},
		'ExtRef created with names that already agree with its uuid → no update': {
			sourceXml: twoDevices(),
			create: {
				parent: INPUTS,
				tagName: 'ExtRef',
				attributes: {
					lnUuid: 'p2-breaker-uuid',
					iedName: 'P2',
					ldInst: 'LD0',
					prefix: 'Q0',
					lnClass: 'XCBR',
					lnInst: '2',
					doName: 'Pos',
					intAddr: 'Pos',
				},
			},
			notUpdated: 'ExtRef',
			expectedQueries: [
				'//default:ExtRef[@intAddr="Pos"][@lnUuid="p2-breaker-uuid"][@iedName="P2"]',
			],
		},
		'IEDName created with the uuid of an access point only → its text and its apRef written': {
			sourceXml: twoDevices({
				extras: '',
			}),
			create: {
				parent: { tagName: 'GSEControl', id: 'p2-gcb' },
				tagName: 'IEDName',
				attributes: { apUuid: 'p1-ap-uuid' },
			},
			expectedQueries: ['//default:IEDName[@apUuid="p1-ap-uuid"][@apRef="AP1"][text()="P1"]'],
		},
		'GSEControl created after the ExtRef naming it by uuid → the names of the ExtRef written': {
			allowIncoherentReferences: 'the control block the ExtRef names is created by the case',
			sourceXml: twoDevices({
				inputs: `<ExtRef ${id}="subscription" srcCBUuid="p2-gcb-new-uuid" serviceType="GOOSE" intAddr="Pos"/>`,
			}),
			create: {
				parent: { tagName: 'LN0', id: 'p2-lln0' },
				tagName: 'GSEControl',
				attributes: { name: 'gcbNew', appID: 'gcbNew', uuid: 'p2-gcb-new-uuid' },
			},
			expectedQueries: [
				'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@srcLDInst="LD0"][@srcCBName="gcbNew"]',
			],
		},
		'LN created after the ExtRef naming it by uuid → the names of the ExtRef written': {
			allowIncoherentReferences: 'the logical node the ExtRef names is created by the case',
			sourceXml: twoDevices({
				inputs: `<ExtRef ${id}="subscription" lnUuid="p2-new-ln-uuid" doName="Pos" intAddr="Pos"/>`,
			}),
			create: {
				parent: { tagName: 'LDevice', id: 'p2-ld' },
				tagName: 'LN',
				attributes: {
					prefix: 'Q1',
					lnClass: 'MMXU',
					inst: '1',
					lnType: 'MMXU_T',
					uuid: 'p2-new-ln-uuid',
				},
			},
			expectedQueries: [
				'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@ldInst="LD0"][@prefix="Q1"][@lnClass="MMXU"][@lnInst="1"]',
			],
		},
		'AccessPoint created after a ConnectedAP naming it by uuid and by the same names → no update': {
			allowIncoherentReferences: 'the access point the ConnectedAP names is created by the case',
			sourceXml: twoDevices({
				communication: `<Communication ${id}="communication"><SubNetwork ${id}="subnetwork" name="W1"><ConnectedAP ${id}="connected-ap" iedName="P2" apName="AP2" apUuid="p2-ap2-uuid"/></SubNetwork></Communication>`,
			}),
			create: {
				parent: { tagName: 'IED', id: 'p2' },
				tagName: 'AccessPoint',
				attributes: { name: 'AP2', uuid: 'p2-ap2-uuid' },
			},
			notUpdated: 'ConnectedAP',
			expectedQueries: [
				'//default:ConnectedAP[@apUuid="p2-ap2-uuid"][@iedName="P2"][@apName="AP2"]',
			],
		},
		'LDevice created after the IEDName naming it by uuid → the IEDName names its IED and logical device':
			{
				allowIncoherentReferences: 'the logical device the IEDName names is created by the case',
				sourceXml: twoDevices({
					registrations: `<IEDName ${id}="subscriber" apRef="AP1" ldUuid="p2-ld2-uuid">P1</IEDName>`,
				}),
				create: {
					parent: { tagName: 'Server', id: 'p2-server' },
					tagName: 'LDevice',
					attributes: { inst: 'LD2', uuid: 'p2-ld2-uuid' },
				},
				expectedQueries: ['//default:IEDName[@ldUuid="p2-ld2-uuid"][@ldInst="LD2"][text()="P2"]'],
			},
		'ExtRef created naming a logical node of its own IED by "@" → the "@" stays, no update': {
			sourceXml: twoDevices(),
			create: {
				parent: INPUTS,
				tagName: 'ExtRef',
				attributes: {
					lnUuid: 'p1-lln0-uuid',
					iedName: '@',
					ldInst: 'LD0',
					lnClass: 'LLN0',
					doName: 'Beh',
					intAddr: 'Beh',
				},
			},
			notUpdated: 'ExtRef',
			expectedQueries: ['//default:ExtRef[@intAddr="Beh"][@iedName="@"][@lnUuid="p1-lln0-uuid"]'],
		},
		'AccessPoint created after the ConnectedAP naming it by uuid → the names of the ConnectedAP written':
			{
				allowIncoherentReferences: 'the access point the ConnectedAP names is created by the case',
				sourceXml: twoDevices({
					communication: `<Communication ${id}="communication"><SubNetwork ${id}="subnetwork" name="W1"><ConnectedAP ${id}="connected-ap" iedName="P1" apName="APX" apUuid="p2-ap2-uuid"/></SubNetwork></Communication>`,
				}),
				create: {
					parent: { tagName: 'IED', id: 'p2' },
					tagName: 'AccessPoint',
					attributes: { name: 'AP2', uuid: 'p2-ap2-uuid' },
				},
				expectedQueries: [
					'//default:ConnectedAP[@apUuid="p2-ap2-uuid"][@iedName="P2"][@apName="AP2"]',
				],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { parent, tagName, attributes } = testCase.create
		await source.transaction(async (tx) => {
			await tx.any.addChild(parent, { tagName, attributes })
			if (testCase.notUpdated) {
				const updated = tx
					.getStagedOperations()
					.flatMap((operation) =>
						operation.status === 'updated' ? [operation.newRecord.tagName] : [],
					)
				expect(updated).not.toContain(testCase.notUpdated)
			}
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
