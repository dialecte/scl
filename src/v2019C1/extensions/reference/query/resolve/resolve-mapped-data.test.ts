import { resolveMappedData } from './resolve-mapped-data'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { MappedData } from './resolve-mapped-data.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The vendor IED: PTOC1 is what the LNode is mapped to, GGIO1 is another logical node. */
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

type TestCase = SclTest.BaseXmlTestCase & {
	reference: { tagName: 'DOS' | 'SDS' | 'DAS'; id: string }
	expected: { lnId: string; dataPath: string[]; origin: MappedData['origin'] } | undefined
}

describe('resolveMappedData', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'DOS without attributes, LNode mapped by uuid -> the LNode logical node and its own name': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-op' },
			expected: { lnId: 'ptoc1', dataPath: ['Op'], origin: 'default' },
		},

		'DOS without attributes, LNode mapped by identity only -> the logical node it names': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<!-- no lnUuid -->
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-op' },
			expected: { lnId: 'ptoc1', dataPath: ['Op'], origin: 'default' },
		},

		'DOS without attributes, LNode not mapped -> no implementation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="PSCH" lnInst="1">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-op' },
			expected: undefined,
		},

		'DOS with its own pair -> the logical node and data it names': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-mod' },
			expected: { lnId: 'ptoc1', dataPath: ['Health'], origin: 'own' },
		},

		'DAS without attributes under a DOS mapped to another DO -> follows that DO': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid">
										<eIEC61850-6-100:DAS ${id}="das-ctl" name="ctlModel"/>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DAS', id: 'das-ctl' },
			expected: { lnId: 'ptoc1', dataPath: ['Health', 'ctlModel'], origin: 'default' },
		},

		'DAS without attributes under an array SDS element -> the element is written name(n)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-hv" name="HA">
										<eIEC61850-6-100:SDS ${id}="sds-har" name="har" ix="3">
											<eIEC61850-6-100:DAS ${id}="das-mag" name="mag"/>
										</eIEC61850-6-100:SDS>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DAS', id: 'das-mag' },
			expected: { lnId: 'ptoc1', dataPath: ['HA', 'har(3)', 'mag'], origin: 'default' },
		},

		'DAS with its own pair in another logical node than its DOS -> its own logical node': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-str" name="Str" mappedDoName="Str2" mappedLnUuid="ptoc1-uuid">
										<eIEC61850-6-100:DAS ${id}="das-general" name="general" mappedDaName="Ind1.stVal" mappedLnUuid="ggio1-uuid"/>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DAS', id: 'das-general' },
			expected: { lnId: 'ggio1', dataPath: ['Ind1', 'stVal'], origin: 'own' },
		},

		'DAS without attributes under an SDS mapped to another logical node -> follows that logical node':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub" name="S1">
							<Function ${id}="fn" name="F1">
								<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
									<Private ${id}="priv" type="eIEC61850-6-100">
										<eIEC61850-6-100:DOS ${id}="dos-a" name="A">
											<eIEC61850-6-100:SDS ${id}="sds-phsa" name="phsA" mappedDoName="PhV.phsB" mappedLnUuid="ggio1-uuid">
												<eIEC61850-6-100:DAS ${id}="das-cval" name="cVal"/>
											</eIEC61850-6-100:SDS>
										</eIEC61850-6-100:DOS>
									</Private>
								</LNode>
							</Function>
						</Substation>
						${VENDOR_IED}
					</SCL>
				`,
				reference: { tagName: 'DAS', id: 'das-cval' },
				expected: { lnId: 'ggio1', dataPath: ['PhV', 'phsB', 'cVal'], origin: 'default' },
			},

		'DAS with its own pair, LNode not mapped -> the logical node and data it names': {
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
			reference: { tagName: 'DAS', id: 'das-general' },
			expected: { lnId: 'ggio1', dataPath: ['Ind2', 'stVal'], origin: 'own' },
		},

		'DAS without attributes under a DOS with its own pair, LNode not mapped -> follows the DOS': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="PSCH" lnInst="1">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Ind2" mappedLnUuid="ggio1-uuid">
										<eIEC61850-6-100:DAS ${id}="das-stval" name="stVal"/>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DAS', id: 'das-stval' },
			expected: { lnId: 'ggio1', dataPath: ['Ind2', 'stVal'], origin: 'default' },
		},

		// ── Partial forms, as other tools may write them ─────────────────────

		'DOS with mappedLnUuid only -> that logical node, its default data path': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedLnUuid="ggio1-uuid"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-op' },
			expected: { lnId: 'ggio1', dataPath: ['Op'], origin: 'own' },
		},

		'DOS with a mapped name only, LNode mapped -> that data in the LNode logical node': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-mod' },
			expected: { lnId: 'ptoc1', dataPath: ['Health'], origin: 'own' },
		},

		'DAS with an absolute reference only, LNode not mapped -> the logical node it names': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="PSCH" lnInst="1">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
										<eIEC61850-6-100:DAS ${id}="das-general" name="general" mappedDaName="VENDOR/LD0/GGIO1.Ind2.stVal"/>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DAS', id: 'das-general' },
			expected: { lnId: 'ggio1', dataPath: ['Ind2', 'stVal'], origin: 'own' },
		},

		'DAS with an absolute reference to a logical node absent from the file -> no implementation': {
			sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub" name="S1">
							<Function ${id}="fn" name="F1">
								<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
									<Private ${id}="priv" type="eIEC61850-6-100">
										<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
											<eIEC61850-6-100:DAS ${id}="das-general" name="general" mappedDaName="OTHER/LD0/GGIO9.Ind2.stVal"/>
										</eIEC61850-6-100:DOS>
									</Private>
								</LNode>
							</Function>
						</Substation>
						${VENDOR_IED}
					</SCL>
				`,
			reference: { tagName: 'DAS', id: 'das-general' },
			expected: undefined,
		},

		'DOS with a mapped name only, LNode not mapped -> no implementation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="PSCH" lnInst="1">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Ind2"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-op' },
			expected: undefined,
		},

		'DOS whose mappedLnUuid names a logical node absent from the file -> no implementation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="missing-uuid"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			reference: { tagName: 'DOS', id: 'dos-mod' },
			expected: undefined,
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const mappedData = await resolveMappedData(source.query, { reference: testCase.reference })
		const actual = mappedData && {
			lnId: mappedData.ln.id,
			dataPath: [...mappedData.dataPath],
			origin: mappedData.origin,
		}
		expect(actual).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
