import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('import of an LNode without its LNodeSpecNaming', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'an LNode allocated to no IED -> it gains its specified naming, its own': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="None" ldInst="Prot" prefix="Main" lnClass="PTOC" lnInst="2" />
						</Function>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode[@lnClass="PTOC"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLdInst="Prot"][@sPrefix="Main"][@sLnClass="PTOC"][@sLnInst="2"]',
			],
			unexpectedQueries: ['//v2019C1:LNodeSpecNaming[@sIedName]'],
		},
		'an LNode bound to an IED -> it gains the naming of the logical node it is bound to, without the IED and LD names':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="substation" name="S1">
							<Function ${id}="function" name="F1">
								<LNode ${id}="lnode" iedName="P1" ldInst="LD0" prefix="Main" lnClass="PTOC" lnInst="2" />
							</Function>
						</Substation>
						<IED ${id}="p1" name="P1">
							<IEDSourceFiles ${id}="p1-source-files">
								<SclFileReference ${id}="p1-icd" fileType="ICD" />
							</IEDSourceFiles>
							<AccessPoint ${id}="p1-ap" name="AP1">
								<Server ${id}="p1-server">
									<Authentication ${id}="p1-authentication" />
									<LDevice ${id}="p1-ld" inst="LD0">
										<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" />
										<LN ${id}="p1-ln" prefix="Main" lnClass="PTOC" inst="2" lnType="PTOC_T" />
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expectedQueries: [
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sPrefix="Main"][@sLnClass="PTOC"][@sLnInst="2"]',
				],
				unexpectedQueries: [
					'//v2019C1:LNodeSpecNaming[@sIedName]',
					'//v2019C1:LNodeSpecNaming[@sLdInst]',
				],
			},
		'an LNode with inputs in its Private -> the naming joins them in that Private': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="PTOC" lnInst="1">
								<Private ${id}="lnode-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef ${id}="source-ref" input="Trip" />
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLnClass="PTOC"][@sLnInst="1"]',
				'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeInputs/v2019C1:SourceRef',
			],
			unexpectedQueries: ['//default:LNode/default:Private[2]'],
		},
		'an LNode with its LNodeSpecNaming -> kept as it is': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="P1" ldInst="LD0" lnClass="PTOC" lnInst="2">
								<Private ${id}="lnode-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="spec-naming" sLnClass="PTOC" sLnInst="7" />
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED ${id}="p1" name="P1">
						<IEDSourceFiles ${id}="p1-source-files">
							<SclFileReference ${id}="p1-icd" fileType="ICD" />
						</IEDSourceFiles>
						<AccessPoint ${id}="p1-ap" name="AP1">
							<Server ${id}="p1-server">
								<Authentication ${id}="p1-authentication" />
								<LDevice ${id}="p1-ld" inst="LD0">
									<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" />
									<LN ${id}="p1-ln" lnClass="PTOC" inst="2" lnType="PTOC_T" />
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:LNodeSpecNaming[@sLnInst="7"]'],
			unexpectedQueries: [
				'//v2019C1:LNodeSpecNaming[2]',
				'//v2019C1:LNodeSpecNaming[@sLnInst="2"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})
