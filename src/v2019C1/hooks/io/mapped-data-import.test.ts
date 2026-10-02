import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** PTOC1 is what the LNode is mapped to, GGIO1 another logical node. */
const VENDOR_IED = /* xml */ `
	<IED ${id}="ied" name="VENDOR">
		<AccessPoint ${id}="ap" name="AP1">
			<Server ${id}="srv">
				<LDevice ${id}="ld" inst="LD0">
					<LN ${id}="ptoc1" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc1-uuid"/>
					<LN ${id}="ggio1" lnClass="GGIO" inst="1" lnType="GGIO_T" uuid="ggio1-uuid"/>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
`

/** An SCL with one LNode mapped to PTOC1 (by `lnodeAttributes`) holding `data`. */
function mappedLNode(data: string, lnodeAttributes = 'lnUuid="ptoc1-uuid"'): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="sub" name="S1">
				<Function ${id}="fn" name="F1">
					<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" ${lnodeAttributes}>
						<Private ${id}="priv" type="eIEC61850-6-100">${data}</Private>
					</LNode>
				</Function>
			</Substation>
			${VENDOR_IED}
		</SCL>
	`
}

describe('mapped data attributes on import', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'DOS stamped with the uuid of its default logical node -> stamp removed': {
			sourceXml: mappedLNode(
				/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedLnUuid="ptoc1-uuid"/>`,
			),
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DAS with an absolute reference to another logical node -> the path from that node and its uuid':
			{
				sourceXml: mappedLNode(/* xml */ `
					<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
						<eIEC61850-6-100:DAS ${id}="das-general" name="general" mappedDaName="VENDOR/LD0/GGIO1.Ind2.stVal"/>
					</eIEC61850-6-100:DOS>
				`),
				expectedQueries: [
					'//v2019C1:DAS[@name="general"][@mappedDaName="Ind2.stVal"][@mappedLnUuid="ggio1-uuid"]',
				],
			},

		'DOS with mappedLnUuid of another logical node only -> its own name completed': {
			sourceXml: mappedLNode(
				/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedLnUuid="ggio1-uuid"/>`,
			),
			expectedQueries: [
				'//v2019C1:DOS[@name="Op"][@mappedDoName="Op"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		'DOS with an absolute reference and its uuid -> the name from the logical node': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="VENDOR/LD0/PTOC1.Health" mappedLnUuid="ptoc1-uuid"/>
			`),
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'DOS with a pair that repeats its default -> both removed': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Op" mappedLnUuid="ptoc1-uuid"/>
			`),
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS with an absolute reference to its default -> removed': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="VENDOR/LD0/PTOC1.Op"/>
			`),
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS with another DO name without uuid -> the uuid of the LNode logical node added': {
			sourceXml: mappedLNode(
				/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health"/>`,
			),
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'DOS with its own name without uuid -> removed': {
			sourceXml: mappedLNode(
				/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Op"/>`,
			),
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS with an absolute reference to a logical node absent from the file -> unchanged': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="OTHER/LD0/GGIO9.Ind2"/>
			`),
			expectedQueries: [
				'//v2019C1:DOS[@name="Op"][@mappedDoName="OTHER/LD0/GGIO9.Ind2"][not(@mappedLnUuid)]',
			],
		},

		'LNode mapped by identity only, DOS stamped with that logical node -> stamp removed': {
			sourceXml: mappedLNode(
				/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedLnUuid="ptoc1-uuid"/>`,
				'',
			),
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS mapped to Health, DAS stamped with the LNode uuid -> DAS stamp removed, it follows Health':
			{
				sourceXml: mappedLNode(/* xml */ `
					<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid">
						<eIEC61850-6-100:DAS ${id}="das-ctl" name="ctlModel" mappedLnUuid="ptoc1-uuid"/>
					</eIEC61850-6-100:DOS>
				`),
				expectedQueries: [
					'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
					'//v2019C1:DAS[@name="ctlModel"][not(@mappedDaName)][not(@mappedLnUuid)]',
				],
			},

		'LNode not mapped, DAS already canonical -> unchanged': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="PSCH" lnInst="1">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
										<eIEC61850-6-100:DAS ${id}="das-general" name="general" mappedDaName="Ind2.stVal" mappedLnUuid="ggio1-uuid"/>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			expectedQueries: [
				'//v2019C1:DAS[@name="general"][@mappedDaName="Ind2.stVal"][@mappedLnUuid="ggio1-uuid"]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async () => ({ assertOn: 'source' }),
	})
})
