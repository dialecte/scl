import { applyUuidRemap } from './apply-uuid-remap'

import { describe } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * Isolated unit test of the primitive — no clone, no hook. The fixture is a
 * hand-built "post-clone, pre-remap" state: a Function carries a fresh uuid while
 * a FunctionRef still points at the SOURCE uuid. `applyUuidRemap` must repoint the
 * ref onto the fresh uuid using the supplied mappings.
 */

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	cloneMappings: Scl.CloneMapping[]
	/** Source elements mapped onto an element the document already holds (nothing cloned for them). */
	redirectMappings?: RedirectMapping[]
}

describe('applyUuidRemap', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'repoints a ref from the source uuid to the clone uuid': {
			allowIncoherentReferences:
				'a freshly cloned reference still carries the uuid of the document it was cloned from',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="Sub1" ${id}="sub-1">
						<Function name="F1" ${id}="fn-clone" uuid="new-uuid">
							<Private type="eIEC61850-6-100" ${id}="priv-c">
								<eIEC61850-6-100:FunctionRef ${id}="fref-clone" function="stale/path" functionUuid="src-uuid"/>
							</Private>
						</Function>
					</Substation>
				</SCL>
			`,
			cloneMappings: [
				{
					source: {
						tagName: 'Function',
						id: 'fn-src',
						attributes: [{ name: 'uuid', value: 'src-uuid' }],
					},
					target: { tagName: 'Function', id: 'fn-clone' },
				},
				{
					source: {
						tagName: 'FunctionRef',
						id: 'fref-src',
						attributes: [{ name: 'uuid', value: 'src-ref-uuid' }],
					},
					target: { tagName: 'FunctionRef', id: 'fref-clone' },
				},
			] as unknown as Scl.CloneMapping[],
			expectedQueries: ['//v2019C1:FunctionRef[@functionUuid="new-uuid"]'],
			unexpectedQueries: ['//v2019C1:FunctionRef[@functionUuid="src-uuid"]'],
		},
		'cloned IED references named by attributes -> the uuid of what was cloned with them, the others kept':
			{
				allowIncoherentReferences:
					'freshly cloned references still carry the uuids of the document they were cloned from',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<IED name="P2" ${id}="ied-clone" uuid="ied-clone-uuid">
							<AccessPoint name="AP1" ${id}="ap-clone" uuid="ap-clone-uuid">
								<Server ${id}="server-clone">
									<LDevice inst="LD0" ${id}="ld-clone" uuid="ld-clone-uuid">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="lln0-clone" uuid="lln0-clone-uuid">
											<DataSet name="ds1" ${id}="dataset-clone">
												<FCDA ${id}="fcda-clone" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" fc="ST" lnUuid="src-breaker-uuid"/>
											</DataSet>
											<GSEControl name="gcb1" appID="gcb1" datSet="ds1" ${id}="gcb-clone" uuid="gcb-clone-uuid">
												<!-- names a subscriber the clone does not hold -->
												<IEDName ${id}="subscriber-clone" apRef="AP1" apUuid="subscriber-ap-uuid">P1</IEDName>
											</GSEControl>
										</LN0>
										<LN prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" ${id}="breaker-clone" uuid="breaker-clone-uuid"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				cloneMappings: [
					{
						source: {
							tagName: 'LN',
							id: 'breaker-src',
							attributes: [{ name: 'uuid', value: 'src-breaker-uuid' }],
						},
						target: { tagName: 'LN', id: 'breaker-clone' },
					},
					{
						source: { tagName: 'FCDA', id: 'fcda-src', attributes: [] },
						target: { tagName: 'FCDA', id: 'fcda-clone' },
					},
					{
						source: { tagName: 'IEDName', id: 'subscriber-src', attributes: [] },
						target: { tagName: 'IEDName', id: 'subscriber-clone' },
					},
				] as unknown as Scl.CloneMapping[],
				expectedQueries: [
					'//default:FCDA[@lnClass="XCBR"][@lnUuid="breaker-clone-uuid"]',
					'//default:IEDName[@apUuid="subscriber-ap-uuid"]',
				],
				unexpectedQueries: ['//default:FCDA[@lnUuid="src-breaker-uuid"]'],
			},
		'a cloned IED reference to an element mapped onto an existing one -> repointed, its names those of that element':
			{
				allowIncoherentReferences:
					'the cloned reference still carries the uuid and the names of the document it was cloned from',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<IED name="P2" ${id}="ied-p2" uuid="ied-p2-uuid">
							<AccessPoint name="AP1" ${id}="ap-p2" uuid="ap-p2-uuid">
								<Server ${id}="server-p2">
									<LDevice inst="LD1" ${id}="ld-p2" uuid="ld-p2-uuid">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="lln0-p2" uuid="lln0-p2-uuid">
											<DataSet name="ds1" ${id}="dataset-clone">
												<FCDA ${id}="fcda-clone" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" fc="ST" lnUuid="src-breaker-uuid"/>
											</DataSet>
										</LN0>
										<LN lnClass="XCBR" inst="3" lnType="XCBR_T" ${id}="breaker-project" uuid="project-breaker-uuid"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				cloneMappings: [
					{
						source: { tagName: 'FCDA', id: 'fcda-src', attributes: [] },
						target: { tagName: 'FCDA', id: 'fcda-clone' },
					},
				] as unknown as Scl.CloneMapping[],
				redirectMappings: [
					{
						sourceUuid: 'src-breaker-uuid',
						target: { tagName: 'LN', id: 'breaker-project' },
					},
				],
				expectedQueries: [
					'//default:FCDA[@lnUuid="project-breaker-uuid"][@ldInst="LD1"][not(@prefix)][@lnClass="XCBR"][@lnInst="3"]',
				],
				unexpectedQueries: ['//default:FCDA[@lnUuid="src-breaker-uuid"]'],
			},
		'a cloned ExtRef naming its control block without its LD, both mapped onto existing ones -> its LD written once, srcLDInst left out':
			{
				allowIncoherentReferences:
					'the cloned reference still carries the uuids and the names of the document it was cloned from',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<IED name="P1" ${id}="ied-p1" uuid="ied-p1-uuid">
							<AccessPoint name="AP1" ${id}="ap-p1" uuid="ap-p1-uuid">
								<Server ${id}="server-p1">
									<LDevice inst="LD0" ${id}="ld-p1" uuid="ld-p1-uuid">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="lln0-p1" uuid="lln0-p1-uuid">
											<Inputs ${id}="inputs-clone">
												<ExtRef ${id}="extref-clone" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" lnUuid="src-breaker-uuid" srcCBName="gcb1" srcCBUuid="src-gcb-uuid" serviceType="GOOSE" intAddr="Pos"/>
											</Inputs>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="P2" ${id}="ied-p2" uuid="ied-p2-uuid">
							<AccessPoint name="AP1" ${id}="ap-p2" uuid="ap-p2-uuid">
								<Server ${id}="server-p2">
									<LDevice inst="LD1" ${id}="ld-p2" uuid="ld-p2-uuid">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="lln0-p2" uuid="lln0-p2-uuid">
											<GSEControl name="gcb1" appID="gcb1" ${id}="gcb-project" uuid="project-gcb-uuid"/>
										</LN0>
										<LN prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" ${id}="breaker-project" uuid="project-breaker-uuid"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				cloneMappings: [
					{
						source: { tagName: 'ExtRef', id: 'extref-src', attributes: [] },
						target: { tagName: 'ExtRef', id: 'extref-clone' },
					},
				] as unknown as Scl.CloneMapping[],
				redirectMappings: [
					{ sourceUuid: 'src-breaker-uuid', target: { tagName: 'LN', id: 'breaker-project' } },
					{ sourceUuid: 'src-gcb-uuid', target: { tagName: 'GSEControl', id: 'gcb-project' } },
				],
				expectedQueries: [
					'//default:ExtRef[@lnUuid="project-breaker-uuid"][@srcCBUuid="project-gcb-uuid"][@ldInst="LD1"][not(@srcLDInst)]',
				],
			},
		'a cloned IEDName whose access point is mapped onto one of another IED -> its text names that IED':
			{
				allowIncoherentReferences:
					'the cloned reference still carries the uuid and the names of the document it was cloned from',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<IED name="P2" ${id}="ied-p2" uuid="ied-p2-uuid">
							<AccessPoint name="AP1" ${id}="ap-p2" uuid="ap-p2-uuid">
								<Server ${id}="server-p2">
									<LDevice inst="LD0" ${id}="ld-p2" uuid="ld-p2-uuid">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="lln0-p2" uuid="lln0-p2-uuid">
											<GSEControl name="gcb1" appID="gcb1" ${id}="gcb-clone" uuid="gcb-clone-uuid">
												<IEDName ${id}="subscriber-clone" apRef="AP1" apUuid="src-ap-uuid">P1</IEDName>
											</GSEControl>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="P5" ${id}="ied-p5" uuid="ied-p5-uuid">
							<AccessPoint name="AP3" ${id}="ap-project" uuid="project-ap-uuid"/>
						</IED>
					</SCL>
				`,
				cloneMappings: [
					{
						source: { tagName: 'IEDName', id: 'subscriber-src', attributes: [] },
						target: { tagName: 'IEDName', id: 'subscriber-clone' },
					},
				] as unknown as Scl.CloneMapping[],
				redirectMappings: [
					{ sourceUuid: 'src-ap-uuid', target: { tagName: 'AccessPoint', id: 'ap-project' } },
				],
				expectedQueries: [
					'//default:IEDName[@apUuid="project-ap-uuid"][@apRef="AP3"][text()="P5"]',
				],
			},
		'a cloned ExtRef naming its own IED with @, its data mapped onto another IED -> names that IED':
			{
				allowIncoherentReferences:
					'the cloned reference still carries the uuid and the names of the document it was cloned from',
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<IED name="P2" ${id}="ied-p2" uuid="ied-p2-uuid">
						<AccessPoint name="AP1" ${id}="ap-p2" uuid="ap-p2-uuid">
							<Server ${id}="server-p2">
								<LDevice inst="LD0" ${id}="ld-p2" uuid="ld-p2-uuid">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="lln0-p2" uuid="lln0-p2-uuid">
										<Inputs ${id}="inputs-clone">
											<ExtRef ${id}="extref-clone" iedName="@" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" lnUuid="src-breaker-uuid" intAddr="Pos"/>
										</Inputs>
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<IED name="P3" ${id}="ied-p3" uuid="ied-p3-uuid">
						<AccessPoint name="AP1" ${id}="ap-p3" uuid="ap-p3-uuid">
							<Server ${id}="server-p3">
								<LDevice inst="LD0" ${id}="ld-p3" uuid="ld-p3-uuid">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${id}="lln0-p3" uuid="lln0-p3-uuid"/>
									<LN prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" ${id}="breaker-project" uuid="project-breaker-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
				cloneMappings: [
					{
						source: { tagName: 'ExtRef', id: 'extref-src', attributes: [] },
						target: { tagName: 'ExtRef', id: 'extref-clone' },
					},
				] as unknown as Scl.CloneMapping[],
				redirectMappings: [
					{ sourceUuid: 'src-breaker-uuid', target: { tagName: 'LN', id: 'breaker-project' } },
				],
				expectedQueries: ['//default:ExtRef[@lnUuid="project-breaker-uuid"][@iedName="P3"]'],
				unexpectedQueries: ['//default:ExtRef[@iedName="@"]'],
			},
		'a cloned ref to an element mapped onto an existing one → repointed to that element, uuid and path':
			{
				allowIncoherentReferences:
					'the cloned reference still carries the uuid of the document it was cloned from',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<Substation name="Sub1" ${id}="sub-1">
							<Private type="eIEC61850-6-100" ${id}="priv-1">
								<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="project-role-uuid" ${id}="role-project"/>
								<eIEC61850-6-100:Application name="App" uuid="app-clone-uuid" ${id}="app-clone">
									<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="template-role-uuid" ${id}="role-ref-clone"/>
								</eIEC61850-6-100:Application>
							</Private>
						</Substation>
					</SCL>
				`,
				cloneMappings: [
					{
						source: {
							tagName: 'AllocationRoleRef',
							id: 'role-ref-template',
							attributes: [],
						},
						target: { tagName: 'AllocationRoleRef', id: 'role-ref-clone' },
					},
				] as unknown as Scl.CloneMapping[],
				redirectMappings: [
					{
						sourceUuid: 'template-role-uuid',
						target: { tagName: 'AllocationRole', id: 'role-project' },
					},
				],
				expectedQueries: [
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid="project-role-uuid"][@allocationRole="Sub1/HMI_PC"]',
				],
				unexpectedQueries: [
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid="template-role-uuid"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await applyUuidRemap(tx, {
				cloneMappings: testCase.cloneMappings,
				redirectMappings: testCase.redirectMappings,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
