import { repointAddedReferences } from './repoint-added-references'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// the instance of an IED template after an update added a data set entry and inputs on LN0, each a copy naming its
// logical node by the template's uuid and names, as the update writes them before their references are repointed; the
// project renumbered its circuit breaker (inst 2, the template's 1)
const instanceWithAddedEntriesXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds-ins" templateUuid="ds-src" ${id}="ds-t">
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-src" ${id}="fcda-t"/>
							</DataSet>
							<Inputs ${id}="inputs-t">
								<ExtRef iedName="IED7" ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" intAddr="Pos" lnUuid="xcbr-src" uuid="ext-ins" ${id}="ext-t"/>
								<ExtRef iedName="IED7" ldInst="LD1" lnClass="CSWI" lnInst="1" doName="Pos" intAddr="Gone" lnUuid="cswi-src" uuid="ext-gone-ins" ${id}="ext-gone-t"/>
							</Inputs>
						</LN0>
						<LN lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="xcbr-ins" templateUuid="xcbr-src" ${id}="xcbr-t"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"/>
		</DataTypeTemplates>
	</SCL>
`

const ADDED_COPIES_NAME_THE_TEMPLATE =
	'the copies an update added still name the template logical node: what the repoint corrects'

describe('repoint of the references an update added to an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		cloneMappings: Scl.CloneMapping[]
		instanceRootRef: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a data set entry added naming the template logical node the instance holds → it names the instance logical node':
			{
				sourceXml: instanceWithAddedEntriesXml,
				allowIncoherentReferences: ADDED_COPIES_NAME_THE_TEMPLATE,
				instanceRootRef: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<Scl.ElementsOf>,
				cloneMappings: [
					{
						source: {
							tagName: 'FCDA',
							id: 'fcda-s',
							attributes: [{ name: 'lnUuid', value: 'xcbr-src' }],
						},
						target: { tagName: 'FCDA', id: 'fcda-t' },
					},
				] as Scl.CloneMapping[],
				expectedQueries: [
					'//default:DataSet[@name="DS1"]/default:FCDA[@doName="Pos"][@lnInst="2"][@lnUuid="xcbr-ins"]',
				],
			},
		'an input added naming the template logical node the instance holds → it names the instance logical node':
			{
				sourceXml: instanceWithAddedEntriesXml,
				allowIncoherentReferences: ADDED_COPIES_NAME_THE_TEMPLATE,
				instanceRootRef: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<Scl.ElementsOf>,
				cloneMappings: [
					{
						source: {
							tagName: 'ExtRef',
							id: 'ext-s',
							attributes: [
								{ name: 'uuid', value: 'ext-src' },
								{ name: 'lnUuid', value: 'xcbr-src' },
							],
						},
						target: { tagName: 'ExtRef', id: 'ext-t' },
					},
				] as Scl.CloneMapping[],
				expectedQueries: [
					'//default:Inputs/default:ExtRef[@intAddr="Pos"][@lnInst="2"][@lnUuid="xcbr-ins"]',
				],
			},
		'an input added naming a template logical node no element of the project stands for → left as it is':
			{
				sourceXml: instanceWithAddedEntriesXml,
				allowIncoherentReferences: ADDED_COPIES_NAME_THE_TEMPLATE,
				instanceRootRef: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<Scl.ElementsOf>,
				cloneMappings: [
					{
						source: {
							tagName: 'ExtRef',
							id: 'ext-gone-s',
							attributes: [
								{ name: 'uuid', value: 'ext-gone-src' },
								{ name: 'lnUuid', value: 'cswi-src' },
							],
						},
						target: { tagName: 'ExtRef', id: 'ext-gone-t' },
					},
				] as Scl.CloneMapping[],
				expectedQueries: [
					'//default:Inputs/default:ExtRef[@intAddr="Gone"][@lnClass="CSWI"][@lnInst="1"][@lnUuid="cswi-src"]',
				],
			},
		'a logical node of a function added naming the template logical node the project holds → its binding left to the binding rules':
			{
				// the LNode's binding follows its lnUuid at the commit: the repoint leaves it as it is
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" ${id}="bay-t">
									<Function name="Breaker" uuid="fn-ins" templateUuid="fn-src" ${id}="fn-t">
										<LNode iedName="IED7" ldInst="LD1" lnClass="XCBR" lnInst="1" lnUuid="xcbr-src" uuid="lnode-ins" templateUuid="lnode-src" ${id}="lnode-t"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t"/>
										<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-ins" templateUuid="xcbr-src" ${id}="xcbr-t"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				allowIncoherentReferences: ADDED_COPIES_NAME_THE_TEMPLATE,
				instanceRootRef: { tagName: 'Function', id: 'fn-t' } as Scl.Ref<Scl.ElementsOf>,
				cloneMappings: [
					{
						source: {
							tagName: 'LNode',
							id: 'lnode-s',
							attributes: [
								{ name: 'uuid', value: 'lnode-src' },
								{ name: 'lnUuid', value: 'xcbr-src' },
							],
						},
						target: { tagName: 'LNode', id: 'lnode-t' },
					},
				] as Scl.CloneMapping[],
				expectedQueries: ['//default:LNode[@lnClass="XCBR"][@lnUuid="xcbr-src"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await repointAddedReferences(tx, {
				cloneMappings: testCase.cloneMappings,
				instanceRootRef: testCase.instanceRootRef,
				matchKey: 'templateUuid',
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
