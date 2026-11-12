import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const ns = ALL_XMLNS_NAMESPACES
const id = CUSTOM_RECORD_ID_ATTRIBUTE

describe('extract IED into a target with prior Header history', () => {
	const testCases: SclTest.TestCases = {
		'a target whose Header holds a history, the selected IED exported → a fresh ISD Header carrying the prior texts as historical context':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="source-root">
						<Header id="source_project" fileType="SCD" toolID="SOURCE_TOOL" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B">
							<History>
								<Hitem version="2" revision="B" when="2025-01-01" who="source-user" what="Source event" why="Source reason">Source-only history text.</Hitem>
							</History>
						</Header>
						<IED name="Selected" manufacturer="SOURCE_ISSUER" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
							<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
											<Inputs>
												<ExtRef iedName="Selected" ldInst="LD1" lnClass="LLN0" doName="Status" daName="stVal" intAddr="self"/>
											</Inputs>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates>
							<LNodeType id="LLN0_Type" lnClass="LLN0">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<DOType id="Status_Type" cdc="SPS">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="target-root">
						<Header id="old_target" toolID="OLD_TOOL" fileType="SSD" uuid="40000000-0000-4000-8000-000000000001" baseUuid="40000000-0000-4000-8000-000000000002" version="8" revision="6">
							<History>
								<Hitem version="7" revision="2" when="2024-01-01" who="old-a" what="Old A" why="Old reason A">Target first historical text.</Hitem>
								<Hitem version="8" revision="6" when="2025-02-02" who="old-b" what="Old B" why="Old reason B">Target second historical text.</Hitem>
							</History>
						</Header>
					</SCL>
				`,
				expectedQueries: [
					'/default:SCL[count(default:Header)=1]/default:Header[@uuid!="40000000-0000-4000-8000-000000000001"][@uuid!="10000000-0000-4000-8000-000000000001"][@id="isd_selected"][@fileType="ISD"][@toolID="CURRENT_TOOL"][@nameStructure="IEDName"][@version="0"][@revision="1"][not(@baseUuid)][count(default:History)=1]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"][@who="current-user"][@what="ISD initialization"][@why="IED specification was extracted from a previous file"][string-length(@when)>0]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@manufacturer="CURRENT_ISSUER"][@uuid="20000000-0000-4000-8000-000000000001"]/default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="LD1"]/default:LN0[@lnType="LLN0_Type"]',
					'/default:SCL/default:Header/default:SourceFiles[count(default:SclFileReference)=1]',
					'/default:SCL/default:IED/default:IEDSourceFiles[count(default:SclFileReference)=1]',
					// the prior target texts carried in order as historical context, the source-only text left out
					'/default:SCL/default:Header/default:History/default:Hitem[contains(normalize-space(.), "Historical context")][contains(normalize-space(.), "Target first historical text.")][contains(normalize-space(.), "Target second historical text.")][contains(substring-before(normalize-space(.), "Target second historical text."), "Target first historical text.")][not(contains(., "Source-only history text."))]',
				],
				unexpectedQueries: ['//default:Inputs', '//default:ExtRef'],
			},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const result = await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({
				sourceQuery: source.query,
				iedRef: { tagName: 'IED', id: 'selected-ied' },
				fileType: 'ISD',
				kind: 'instance',
				inputs: 'none',
				issuer: 'CURRENT_ISSUER',
				tool: 'CURRENT_TOOL',
				who: 'current-user',
				nameStructure: 'IEDName',
			})
		})
		expect(result).toEqual({ warnings: [] })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
