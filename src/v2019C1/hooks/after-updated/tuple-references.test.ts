import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * P1 subscribes to P2's gcb1 (data Q0XCBR2) and reads its own LLN0; P2 lists P1's AP1 as a subscriber and
 * publishes on subnetwork W1. Every reference carries the uuid of what it names.
 */
const twoDevices = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<Communication ${id}="communication">
			<SubNetwork ${id}="subnetwork" name="W1">
				<ConnectedAP ${id}="p2-connected-ap" iedName="P2" apName="AP1" apUuid="p2-ap-uuid">
					<GSE ${id}="p2-gse" ldInst="LD0" cbName="gcb1" cbUuid="p2-gcb-uuid"/>
				</ConnectedAP>
			</SubNetwork>
		</Communication>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0" uuid="p1-ld-uuid">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p1-lln0-uuid">
							<Inputs ${id}="p1-inputs">
								<ExtRef ${id}="p1-subscription" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" lnUuid="p2-breaker-uuid" srcLDInst="LD0" srcCBName="gcb1" srcCBUuid="p2-gcb-uuid" serviceType="GOOSE" intAddr="Pos"/>
								<ExtRef ${id}="p1-internal" iedName="@" ldInst="LD0" lnClass="LLN0" doName="Beh" lnUuid="p1-lln0-uuid" intAddr="Beh"/>
								<!-- its control block named without its logical device: the one of its data -->
								<ExtRef ${id}="p1-short-form" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" lnUuid="p2-breaker-uuid" srcCBName="gcb1" srcCBUuid="p2-gcb-uuid" serviceType="GOOSE" intAddr="PosShort"/>
								<ExtRef ${id}="p1-report" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" lnUuid="p2-breaker-uuid" srcLDInst="LD0" srcPrefix="Q0" srcLNClass="XCBR" srcLNInst="2" srcCBName="rcb1" srcCBUuid="p2-rcb-uuid" serviceType="Report" intAddr="PosReport"/>
								<!-- written by a tool that set the names only: the import fills its lnUuid -->
								<ExtRef ${id}="p1-names-only" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="BlkOpn" intAddr="BlkOpn"/>
							</Inputs>
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
							<DataSet ${id}="p2-dataset" name="ds1">
								<FCDA ${id}="p2-fcda" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" fc="ST" lnUuid="p2-breaker-uuid"/>
							</DataSet>
							<GSEControl ${id}="p2-gcb" name="gcb1" appID="gcb1" datSet="ds1" uuid="p2-gcb-uuid">
								<IEDName ${id}="p2-subscriber" apRef="AP1" apUuid="p1-ap-uuid">P1</IEDName>
								<!-- naming a logical device: its apUuid, meant for an IEDName naming an access point only, does not apply -->
								<IEDName ${id}="p2-subscriber-ld" apRef="AP1" apUuid="p1-ap-uuid" ldInst="LD0" ldUuid="p1-ld-uuid">P1</IEDName>
							</GSEControl>
						</LN0>
						<LN ${id}="p2-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="p2-breaker-uuid">
							<!-- a data set of the same name in another logical node -->
							<DataSet ${id}="p2-breaker-dataset" name="ds1">
								<FCDA ${id}="p2-breaker-fcda" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" fc="ST" lnUuid="p2-breaker-uuid"/>
							</DataSet>
							<ReportControl ${id}="p2-rcb" name="rcb1" confRev="1" datSet="ds1" uuid="p2-rcb-uuid"/>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

describe('tuple references follow a rename', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		rename: {
			tagName: 'IED' | 'AccessPoint' | 'LDevice' | 'LN' | 'GSEControl' | 'DataSet'
			id: string
			attributes: Record<string, string>
		}
		/** Records the rename must stage no update for: what they name reads the same. */
		notUpdated?: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'IED renamed -> the ConnectedAP and the other IED ExtRef naming it follow': {
			sourceXml: twoDevices,
			rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
			expectedQueries: [
				'//default:ConnectedAP[@iedName="P9"][@apName="AP1"][@apUuid="p2-ap-uuid"]',
				'//default:ExtRef[@intAddr="Pos"][@iedName="P9"][@lnUuid="p2-breaker-uuid"][@srcCBUuid="p2-gcb-uuid"]',
			],
			unexpectedQueries: [
				'//default:ConnectedAP[@iedName="P2"]',
				'//default:ExtRef[@intAddr="Pos"][@iedName="P2"]',
			],
		},

		'subscriber IED renamed -> the IEDName listing it follows, its own reference with @ stays @': {
			sourceXml: twoDevices,
			rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P7' } },
			expectedQueries: [
				'//default:IEDName[@apRef="AP1"][@apUuid="p1-ap-uuid"][text()="P7"]',
				'//default:ExtRef[@intAddr="Beh"][@iedName="@"][not(@prefix)][not(@lnInst)]',
			],
			unexpectedQueries: ['//default:IEDName[text()="P1"]'],
		},

		'IED renamed -> a reference already naming it right is not updated': {
			sourceXml: twoDevices,
			rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
			notUpdated: ['p2-fcda', 'p2-gse'],
			expectedQueries: ['//default:ConnectedAP[@iedName="P9"]'],
		},

		'access point renamed -> an IEDName naming a logical device does not follow by its apUuid': {
			sourceXml: twoDevices,
			rename: { tagName: 'AccessPoint', id: 'p1-ap', attributes: { name: 'AP7' } },
			expectedQueries: [
				'//default:IEDName[not(@ldInst)][@apRef="AP7"][@apUuid="p1-ap-uuid"]',
				'//default:IEDName[@ldInst="LD0"][@apRef="AP1"]',
			],
		},

		'logical node prefix cleared -> the references naming it leave their prefix out': {
			sourceXml: twoDevices,
			rename: { tagName: 'LN', id: 'p2-breaker', attributes: { prefix: '' } },
			expectedQueries: [
				'//default:ExtRef[@intAddr="Pos"][not(@prefix)][@lnClass="XCBR"][@lnInst="2"]',
				'//default:ExtRef[@intAddr="PosReport"][not(@prefix)][not(@srcPrefix)][@srcLNClass="XCBR"]',
				'//default:FCDA[@ldInst="LD0"][not(@prefix)][@lnClass="XCBR"][@lnUuid="p2-breaker-uuid"]',
			],
		},

		'access point renamed -> the ConnectedAP naming it follows': {
			sourceXml: twoDevices,
			rename: { tagName: 'AccessPoint', id: 'p2-ap', attributes: { name: 'AP9' } },
			expectedQueries: [
				'//default:ConnectedAP[@iedName="P2"][@apName="AP9"][@apUuid="p2-ap-uuid"]',
			],
		},

		'logical device renamed -> ExtRef, FCDA and GSE naming it follow': {
			sourceXml: twoDevices,
			rename: { tagName: 'LDevice', id: 'p2-ld', attributes: { inst: 'LD5' } },
			expectedQueries: [
				'//default:ExtRef[@intAddr="Pos"][@ldInst="LD5"][@srcLDInst="LD5"]',
				'//default:FCDA[@ldInst="LD5"][@lnUuid="p2-breaker-uuid"]',
				'//default:GSE[@ldInst="LD5"][@cbUuid="p2-gcb-uuid"]',
			],
		},

		'logical node renumbered -> ExtRef and FCDA naming it follow, the one written by its names only too':
			{
				sourceXml: twoDevices,
				rename: { tagName: 'LN', id: 'p2-breaker', attributes: { inst: '3' } },
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="3"]',
					'//default:FCDA[@lnInst="3"]',
					'//default:ExtRef[@intAddr="BlkOpn"][@lnInst="3"][@lnUuid="p2-breaker-uuid"]',
				],
			},

		'control block renamed -> GSE and ExtRef naming it follow, its LN0 left implicit': {
			sourceXml: twoDevices,
			rename: { tagName: 'GSEControl', id: 'p2-gcb', attributes: { name: 'gcb9' } },
			expectedQueries: [
				'//default:GSE[@cbName="gcb9"][@cbUuid="p2-gcb-uuid"]',
				'//default:ExtRef[@intAddr="Pos"][@srcCBName="gcb9"][not(@srcLNClass)]',
			],
		},

		'data set renamed -> the control block publishing it follows': {
			sourceXml: twoDevices,
			rename: { tagName: 'DataSet', id: 'p2-dataset', attributes: { name: 'ds9' } },
			expectedQueries: [
				'//default:GSEControl[@name="gcb1"][@datSet="ds9"]',
				'//default:ReportControl[@name="rcb1"][@datSet="ds1"]',
			],
			unexpectedQueries: ['//default:GSEControl[@datSet="ds1"]'],
		},

		'logical device renamed, an ExtRef naming its control block without its LD -> ldInst follows, srcLDInst stays left out':
			{
				sourceXml: twoDevices,
				rename: { tagName: 'LDevice', id: 'p2-ld', attributes: { inst: 'LD5' } },
				expectedQueries: ['//default:ExtRef[@intAddr="PosShort"][@ldInst="LD5"][not(@srcLDInst)]'],
			},

		'logical node holding a report control block renumbered -> the ExtRef subscribing it follows on both names':
			{
				sourceXml: twoDevices,
				rename: { tagName: 'LN', id: 'p2-breaker', attributes: { inst: '3' } },
				expectedQueries: [
					'//default:ExtRef[@intAddr="PosReport"][@lnInst="3"][@srcLNInst="3"][@srcCBName="rcb1"]',
				],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { tagName, id: recordId, attributes } = testCase.rename
		await source.transaction(async (tx) => {
			await tx.any.update({ tagName, id: recordId }, { attributes })
			const updated = tx
				.getStagedOperations()
				.flatMap((operation) => (operation.status === 'updated' ? [operation.newRecord.id] : []))
			expect(updated.filter((updatedId) => testCase.notUpdated?.includes(updatedId))).toEqual([])
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
