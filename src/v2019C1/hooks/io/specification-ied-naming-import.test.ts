import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * F1 holds four LNodes without LNodeSpecNaming: `on-s1-by-names` names S1/CTRL/CSWI1 by its names only,
 * `on-s1-by-uuid` names S1's CSWI1 by its lnUuid while its names keep the template's SPECIFICATION/OLD/QACSWI7, `on-r1`
 * names R1's Q0CSWI3 by both, `on-vendor` (on no IED) names by its lnUuid a copy VGGIO5 in a vendor's Private of S1,
 * vendor payload, no logical node of S1. S1 has no source file (a specification IED); R1 comes from an ICD file (a real IED).
 */
const project = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="on-s1-by-names" iedName="S1" ldInst="CTRL" lnClass="CSWI" lnInst="1" uuid="on-s1-by-names-uuid"/>
				<LNode ${id}="on-s1-by-uuid" iedName="SPECIFICATION" ldInst="OLD" prefix="QA" lnClass="CSWI" lnInst="7" lnUuid="s1-cswi-uuid" uuid="on-s1-by-uuid-uuid"/>
				<LNode ${id}="on-vendor" iedName="None" lnClass="GGIO" lnInst="9" lnUuid="vendor-uuid" uuid="on-vendor-uuid"/>
				<LNode ${id}="on-r1" iedName="R1" ldInst="LD0" prefix="Q0" lnClass="CSWI" lnInst="3" lnUuid="r1-cswi-uuid" uuid="on-r1-uuid"/>
			</Function>
		</Substation>
		<IED ${id}="s1" name="S1">
			<AccessPoint ${id}="s1-ap" name="AP1">
				<Server ${id}="s1-server">
					<LDevice ${id}="s1-ld" inst="CTRL">
						<LN0 ${id}="s1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T"/>
						<LN ${id}="s1-cswi" prefix="" lnClass="CSWI" inst="1" lnType="CSWI_T" uuid="s1-cswi-uuid"/>
						<Private ${id}="s1-vendor" type="vendor">
							<LN ${id}="s1-vendor-ln" prefix="V" lnClass="GGIO" inst="5" lnType="GGIO_T" uuid="vendor-uuid"/>
						</Private>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="r1" name="R1">
			<IEDSourceFiles ${id}="r1-source-files">
				<SclFileReference ${id}="r1-icd" fileType="ICD"/>
			</IEDSourceFiles>
			<AccessPoint ${id}="r1-ap" name="AP1">
				<Server ${id}="r1-server">
					<LDevice ${id}="r1-ld" inst="LD0">
						<LN0 ${id}="r1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T"/>
						<LN ${id}="r1-cswi" prefix="Q0" lnClass="CSWI" inst="3" lnType="CSWI_T" uuid="r1-cswi-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

const INCOHERENT_SOURCE =
	'on-s1-by-uuid names another logical node than its lnUuid: what the import writes'

describe('import of an LNode bound to a specification IED without its LNodeSpecNaming', () => {
	const testCases: SclTest.TestCases = {
		'an LNode naming a logical node of a specification IED by its names -> specified on that IED and logical device':
			{
				sourceXml: project,
				allowIncoherentReferences: INCOHERENT_SOURCE,
				expectedQueries: [
					'//default:LNode[@uuid="on-s1-by-names-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"][@sLdInst="CTRL"][@sLnClass="CSWI"][@sLnInst="1"]',
				],
			},

		'an LNode whose lnUuid names a logical node of a specification IED and whose names name another -> the lnUuid wins, specified on that IED':
			{
				sourceXml: project,
				allowIncoherentReferences: INCOHERENT_SOURCE,
				expectedQueries: [
					'//default:LNode[@uuid="on-s1-by-uuid-uuid"][@iedName="S1"][@ldInst="CTRL"][@lnInst="1"]//v2019C1:LNodeSpecNaming[@sIedName="S1"][@sLdInst="CTRL"][@sLnClass="CSWI"][@sLnInst="1"][not(@sPrefix)]',
				],
				unexpectedQueries: ['//v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION"]'],
			},

		'an LNode whose lnUuid names a logical node in vendor payload -> left as read, no IED specified':
			{
				sourceXml: project,
				allowIncoherentReferences: INCOHERENT_SOURCE,
				expectedQueries: [
					'//default:LNode[@uuid="on-vendor-uuid"][@iedName="None"][@lnClass="GGIO"][@lnInst="9"][not(@ldInst)]',
				],
				unexpectedQueries: [
					'//default:LNode[@uuid="on-vendor-uuid"]//v2019C1:LNodeSpecNaming[@sIedName]',
				],
			},

		'an LNode bound to a real IED -> no IED specified': {
			sourceXml: project,
			allowIncoherentReferences: INCOHERENT_SOURCE,
			expectedQueries: [
				'//default:LNode[@uuid="on-r1-uuid"]//v2019C1:LNodeSpecNaming[@sPrefix="Q0"][@sLnClass="CSWI"][@sLnInst="3"]',
			],
			unexpectedQueries: [
				'//default:LNode[@uuid="on-r1-uuid"]//v2019C1:LNodeSpecNaming[@sIedName]',
				'//default:LNode[@uuid="on-r1-uuid"]//v2019C1:LNodeSpecNaming[@sLdInst]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})
