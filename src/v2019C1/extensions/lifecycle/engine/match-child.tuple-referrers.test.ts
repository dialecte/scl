import { diff } from './diff'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Two IEDs, X with two GOOSE control blocks, Y with none: what the connections of both name. */
const ieds = /* xml */ `
	<IED name="X" uuid="e0000000-0000-4000-8000-000000000001">
		<AccessPoint name="AP1" uuid="e0000000-0000-4000-8000-000000000011">
			<Server>
				<Authentication/>
				<LDevice inst="CTRL" uuid="e0000000-0000-4000-8000-000000000021">
					<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="e0000000-0000-4000-8000-000000000031">
						<GSEControl name="A" appID="X_A" uuid="e0000000-0000-4000-8000-000000000041"/>
						<GSEControl name="B" appID="X_B" uuid="e0000000-0000-4000-8000-000000000042"/>
					</LN0>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
	<IED name="Y" uuid="e0000000-0000-4000-8000-000000000002">
		<AccessPoint name="AP1" uuid="e0000000-0000-4000-8000-000000000012"/>
	</IED>
	<DataTypeTemplates>
		<LNodeType id="LLN0_T" lnClass="LLN0">
			<DO name="Beh" type="ENS_T"/>
		</LNodeType>
		<DOType id="ENS_T" cdc="ENS">
			<DA name="stVal" bType="INT32" fc="ST"/>
		</DOType>
	</DataTypeTemplates>
`

type TestCase = SclTest.BaseXmlTestCase & {
	expected: { added: number; removed: number; modified: number }
}

// A connection (`ConnectedAP`) and its control block addresses (`GSE`, `SMV`) have no uuid of their own and hold
// addresses: each is paired with the project's one naming the same access point or control block, by its uuid, else by
// the names it gives, never by its position among its siblings. The same file in another order reads unchanged.
describe('diff - the connections and control block addresses of a subnetwork, paired by what they name', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the project listing the connections in the other order → each paired with the one naming its access point, nothing changed':
			{
				sourceXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="source-subnetwork">
							<ConnectedAP iedName="X" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000011">
								<Address><P type="IP">10.0.0.1</P></Address>
							</ConnectedAP>
							<ConnectedAP iedName="Y" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000012">
								<Address><P type="IP">10.0.0.2</P></Address>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				targetXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="project-subnetwork">
							<ConnectedAP iedName="Y" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000012">
								<Address><P type="IP">10.0.0.2</P></Address>
							</ConnectedAP>
							<ConnectedAP iedName="X" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000011">
								<Address><P type="IP">10.0.0.1</P></Address>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				expected: { added: 0, removed: 0, modified: 0 },
			},
		'the project listing the GOOSE addresses of a connection in the other order → each paired with the one naming its control block, nothing changed':
			{
				sourceXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="source-subnetwork">
							<ConnectedAP iedName="X" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000011">
								<GSE ldInst="CTRL" cbName="A" cbUuid="e0000000-0000-4000-8000-000000000041">
									<Address><P type="MAC-Address">01-0C-CD-01-00-01</P></Address>
								</GSE>
								<GSE ldInst="CTRL" cbName="B" cbUuid="e0000000-0000-4000-8000-000000000042">
									<Address><P type="MAC-Address">01-0C-CD-01-00-02</P></Address>
								</GSE>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				targetXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="project-subnetwork">
							<ConnectedAP iedName="X" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000011">
								<GSE ldInst="CTRL" cbName="B" cbUuid="e0000000-0000-4000-8000-000000000042">
									<Address><P type="MAC-Address">01-0C-CD-01-00-02</P></Address>
								</GSE>
								<GSE ldInst="CTRL" cbName="A" cbUuid="e0000000-0000-4000-8000-000000000041">
									<Address><P type="MAC-Address">01-0C-CD-01-00-01</P></Address>
								</GSE>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				expected: { added: 0, removed: 0, modified: 0 },
			},
		'the project writing its connections without their uuid, in the other order → each paired with the one giving the same names, nothing changed':
			{
				sourceXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="source-subnetwork">
							<ConnectedAP iedName="X" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000011">
								<Address><P type="IP">10.0.0.1</P></Address>
							</ConnectedAP>
							<ConnectedAP iedName="Y" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000012">
								<Address><P type="IP">10.0.0.2</P></Address>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				targetXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="project-subnetwork">
							<ConnectedAP iedName="Y" apName="AP1">
								<Address><P type="IP">10.0.0.2</P></Address>
							</ConnectedAP>
							<ConnectedAP iedName="X" apName="AP1">
								<Address><P type="IP">10.0.0.1</P></Address>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				expected: { added: 0, removed: 0, modified: 0 },
			},
		'connections naming their IED by names only, in the other order → each paired with the one giving the same names, nothing changed':
			{
				sourceXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="source-subnetwork">
							<ConnectedAP iedName="X" apName="AP1">
								<Address><P type="IP">10.0.0.1</P></Address>
							</ConnectedAP>
							<ConnectedAP iedName="Y" apName="AP1">
								<Address><P type="IP">10.0.0.2</P></Address>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				targetXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" uuid="e0000000-0000-4000-8000-000000000050" ${id}="project-subnetwork">
							<ConnectedAP iedName="Y" apName="AP1">
								<Address><P type="IP">10.0.0.2</P></Address>
							</ConnectedAP>
							<ConnectedAP iedName="X" apName="AP1">
								<Address><P type="IP">10.0.0.1</P></Address>
							</ConnectedAP>
						</SubNetwork>
					</Communication>
					${ieds}
				</SCL>
			`,
				expected: { added: 0, removed: 0, modified: 0 },
			},
	}

	async function act({ source, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const compared = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef: { tagName: 'SubNetwork', id: 'source-subnetwork' },
			instanceRootRef: { tagName: 'SubNetwork', id: 'project-subnetwork' },
			matchKey: 'uuid',
		})
		const { added, removed, modified } = compared.summary
		expect({ added, removed, modified }).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
