import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * P1 holds the logical node Q0XCBR2, which an LNode of function F1 names by its names only (no uuid, as a
 * tool that sets names leaves it); a second LNode names P2 the same way. P2 reads a logical node P1 does not hold with an ExtRef naming P1 by names only.
 */
const namesOnlyReferences = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode" iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" uuid="lnode-uuid">
					<Private ${id}="lnode-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="lnode-spec-naming" sLdInst="LD0" sPrefix="Q0" sLnClass="XCBR" sLnInst="2"/>
					</Private>
				</LNode>
				<!-- names P2 by its names only -->
				<LNode ${id}="lnode-p2" iedName="P2" ldInst="LD0" lnClass="XCBR" lnInst="1" uuid="lnode-p2-uuid"/>
			</Function>
		</Substation>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0" uuid="p1-ld-uuid">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p1-lln0-uuid"/>
						<LN ${id}="p1-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="p1-breaker-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1" uuid="p2-ap-uuid">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0" uuid="p2-ld-uuid">
						<LN0 ${id}="p2-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p2-lln0-uuid">
							<Inputs ${id}="p2-inputs">
								<!-- names a logical node P1 does not hold: the import has no uuid to fill -->
								<ExtRef ${id}="p2-names-only" iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="9" doName="Pos" intAddr="Pos"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/**
 * The LNode of F1 names P1's Q0XCBR2 by its names only and holds a SourceRef reading the ExtRef of P1's
 * Q0GGIO1: the address of that ExtRef is composed from where the LNode's logical node sits. The rename of P1 writes
 * that address again: from an LNode left on P1 it would name the ExtRef in full (P9/LD0/...), from an LNode that
 * follows to P9 it stays relative.
 */
const namesOnlyLNodeWithSourceRef = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode" iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" uuid="lnode-uuid">
					<eIEC61850-6-100:LNodeInputs ${id}="lnode-inputs">
						<eIEC61850-6-100:SourceRef ${id}="source-ref" input="Trip" extRefUuid="p1-trip-uuid" extRefAddr="LD0/Q0GGIO1.Trip"/>
					</eIEC61850-6-100:LNodeInputs>
				</LNode>
			</Function>
		</Substation>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0" uuid="p1-ld-uuid">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p1-lln0-uuid"/>
						<LN ${id}="p1-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="p1-breaker-uuid"/>
						<LN ${id}="p1-gio" prefix="Q0" lnClass="GGIO" inst="1" lnType="GGIO_T" uuid="p1-gio-uuid">
							<Inputs ${id}="p1-gio-inputs">
								<ExtRef ${id}="p1-trip" intAddr="Trip" uuid="p1-trip-uuid"/>
							</Inputs>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/** Two IEDs hold the name P1 (a copy of P1 not renamed yet); the LNode names P1 by its names only. */
const twoIedsNamedP1 = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode" iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" uuid="lnode-uuid"/>
			</Function>
		</Substation>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0" uuid="p1-ld-uuid">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p1-lln0-uuid"/>
						<LN ${id}="p1-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="p1-breaker-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p1-copy" name="P1">
			<AccessPoint ${id}="copy-ap" name="AP1" uuid="copy-ap-uuid">
				<Server ${id}="copy-server">
					<LDevice ${id}="copy-ld" inst="LD0" uuid="copy-ld-uuid">
						<LN0 ${id}="copy-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="copy-lln0-uuid"/>
						<LN ${id}="copy-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="copy-breaker-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/** P2's control block lists P1 in an IEDName with no uuid on it; a ConnectedAP names P1 the same way. */
const namesOnlySubscriber = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Communication ${id}="communication">
			<SubNetwork ${id}="subnetwork" name="W1">
				<!-- names an access point P1 does not hold: the import has no uuid to fill -->
				<ConnectedAP ${id}="p1-connected-ap" iedName="P1" apName="AP9"/>
			</SubNetwork>
		</Communication>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid"/>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1" uuid="p2-ap-uuid">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0" uuid="p2-ld-uuid">
						<LN0 ${id}="p2-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p2-lln0-uuid">
							<GSEControl ${id}="p2-gcb" name="gcb1" appID="gcb1" uuid="p2-gcb-uuid">
								<IEDName ${id}="p2-subscriber">P1</IEDName>
							</GSEControl>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/**
 * P2 reads P1's data with an ExtRef naming P1 by its names, and its control block by a uuid naming no element of the
 * document: a uuid on one pair, none the rename of P1 resolves.
 */
const uuidOnAnotherPair = /* xml */ `
	<SCL ${ns} ${id}="root">
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid"/>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1" uuid="p2-ap-uuid">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0" uuid="p2-ld-uuid">
						<LN0 ${id}="p2-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p2-lln0-uuid">
							<Inputs ${id}="p2-inputs">
								<ExtRef ${id}="p2-dangling-cb" iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="9" doName="Pos" intAddr="PosCb" srcCBName="gcb9" srcCBUuid="no-control-block-uuid" serviceType="GOOSE"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

describe('names-only references follow an IED rename', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		rename: {
			tagName: 'IED' | 'LN'
			id: string
			attributes: Record<string, string>
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'IED renamed, an LNode naming it by names only -> its iedName follows, its specified naming kept':
			{
				sourceXml: namesOnlyReferences,
				rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P9' } },
				expectedQueries: [
					'//default:LNode[@iedName="P9"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"][not(@lnUuid)]',
					'//v2019C1:LNodeSpecNaming[@sLdInst="LD0"][@sPrefix="Q0"][@sLnClass="XCBR"][@sLnInst="2"]',
				],
				unexpectedQueries: ['//default:LNode[@iedName="P1"]'],
			},

		'IED renamed, an ExtRef of another IED naming it by names only -> its iedName follows': {
			sourceXml: namesOnlyReferences,
			rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P9' } },
			expectedQueries: [
				'//default:ExtRef[@intAddr="Pos"][@iedName="P9"][@lnClass="XCBR"][@lnInst="9"][not(@lnUuid)]',
			],
			unexpectedQueries: ['//default:ExtRef[@intAddr="Pos"][@iedName="P1"]'],
		},

		'IED renamed, an LNode naming it by names only holds a SourceRef -> the address of its ExtRef is written from the LNode as it follows':
			{
				sourceXml: namesOnlyLNodeWithSourceRef,
				rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P9' } },
				expectedQueries: [
					'//v2019C1:SourceRef[@extRefUuid="p1-trip-uuid"][@extRefAddr="LD0/Q0GGIO1.Trip"]',
					'//default:LNode[@iedName="P9"]',
				],
			},

		'IED renamed, an IEDName and a ConnectedAP naming it by names only -> its text and the iedName follow':
			{
				sourceXml: namesOnlySubscriber,
				rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P9' } },
				expectedQueries: [
					'//default:GSEControl[@name="gcb1"]/default:IEDName[text()="P9"]',
					'//default:ConnectedAP[@iedName="P9"][@apName="AP9"][not(@apUuid)]',
				],
				unexpectedQueries: [
					'//default:IEDName[text()="P1"]',
					'//default:ConnectedAP[@iedName="P1"]',
				],
			},

		'IED renamed, an ExtRef naming it by names but holding a uuid on another pair -> its iedName stays':
			{
				sourceXml: uuidOnAnotherPair,
				allowIncoherentReferences:
					'the uuid on the control block pair names nothing: a uuid the rename does not resolve is the point',
				rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P9' } },
				expectedQueries: [
					'//default:ExtRef[@intAddr="PosCb"][@iedName="P1"][@srcCBUuid="no-control-block-uuid"]',
				],
			},

		'IED renamed, an LNode naming another IED by names only -> it stays': {
			sourceXml: namesOnlyReferences,
			rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P9' } },
			expectedQueries: ['//default:LNode[@uuid="lnode-p2-uuid"][@iedName="P2"]'],
		},

		'IED renamed onto the name another IED holds -> the references naming it by names only stay': {
			sourceXml: namesOnlyReferences,
			rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P2' } },
			allowInvalidOutput: {
				reason:
					'two IEDs named P2 is the state the rename leaves, the case is what references do then',
				violations: [{ check: 'uniqueness' }, { check: 'xsd' }],
			},
			expectedQueries: [
				'//default:LNode[@uuid="lnode-uuid"][@iedName="P1"]',
				'//default:ExtRef[@intAddr="Pos"][@iedName="P1"]',
			],
		},

		'IED renamed while another IED holds its name -> the LNode naming it by names only stays': {
			sourceXml: twoIedsNamedP1,
			rename: { tagName: 'IED', id: 'p1-copy', attributes: { name: 'P9' } },
			expectedQueries: ['//default:LNode[@iedName="P1"]'],
			unexpectedQueries: ['//default:LNode[@iedName="P9"]'],
		},

		'logical node renumbered -> the LNode naming it by names only does not follow': {
			sourceXml: namesOnlyReferences,
			rename: { tagName: 'LN', id: 'p1-breaker', attributes: { inst: '3' } },
			expectedQueries: ['//default:LNode[@iedName="P1"][@lnInst="2"]'],
			unexpectedQueries: ['//default:LNode[@lnInst="3"]'],
		},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { tagName, id: recordId, attributes } = testCase.rename
		await source.transaction(async (tx) => {
			await tx.any.update({ tagName, id: recordId }, { attributes })
			expect(tx.getStagedOperations().length).toBeGreaterThan(0)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
