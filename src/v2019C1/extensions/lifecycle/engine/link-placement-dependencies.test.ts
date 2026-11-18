import { linkPlacementDependencies } from './link-placement-dependencies'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup, ReportInstance } from './diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A report instance holding the given groups, nothing else told. */
function instanceOf(groups: DecisionGroup[]): ReportInstance {
	return {
		title: 'IED7',
		linked: true,
		upToDate: false,
		mappings: [],
		groups,
		tree: { change: 'unchanged', tagName: 'IED', children: [] },
	}
}

describe('the dependencies of the groups of one placement', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		groups: DecisionGroup[]
		/** Each group's dependencies, by group id. */
		expected: Record<string, string[]>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a group adding a data set entry on a logical node another group adds → it depends on that group':
			{
				// the template adds the circuit breaker's logical node, and an entry on it in the data set of LN0
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="template">
					<IED name="TPL" uuid="ied-src" ${id}="ied-s">
						<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
							<Server ${id}="srv-s">
								<Authentication ${id}="auth-s"/>
								<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
										<DataSet name="DS1" uuid="ds-src" ${id}="ds-s">
											<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-src" ${id}="fcda-s"/>
										</DataSet>
									</LN0>
									<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-src" ${id}="xcbr-s"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<DataTypeTemplates ${id}="dtt-s">
						<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
						<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-s"/>
					</DataTypeTemplates>
				</SCL>
			`,
				groups: [
					{
						id: 'logical-node',
						change: 'added',
						title: 'added LN',
						primary: {
							change: 'added',
							tagName: 'LN',
							sourceRef: { tagName: 'LN', id: 'xcbr-s' },
							children: [],
						},
						companions: [],
						dependsOn: [],
						suggestedAction: 'accept',
					},
					{
						id: 'data-set',
						change: 'modified',
						title: 'modified DataSet',
						primary: {
							change: 'modified',
							tagName: 'DataSet',
							sourceRef: { tagName: 'DataSet', id: 'ds-s' },
							instanceRef: { tagName: 'DataSet', id: 'ds-t' },
							children: [
								{
									change: 'added',
									tagName: 'FCDA',
									sourceRef: { tagName: 'FCDA', id: 'fcda-s' },
									children: [],
								},
							],
						},
						companions: [],
						dependsOn: [],
						suggestedAction: 'accept',
					},
				],
				expected: { 'logical-node': [], 'data-set': ['logical-node'] },
			},
		'a group adding a logical node of a function bound to a logical node another group adds → no dependency: the binding rules own it':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="template">
					<Substation name="S1" ${id}="sub-s">
						<VoltageLevel name="V1" ${id}="vl-s">
							<Bay name="B1" ${id}="bay-s">
								<Function name="Breaker" uuid="fn-src" ${id}="fn-s">
									<LNode iedName="TPL" ldInst="LD1" lnClass="XCBR" lnInst="1" lnUuid="xcbr-src" uuid="lnode-src" ${id}="lnode-s"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="TPL" uuid="ied-src" ${id}="ied-s">
						<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
							<Server ${id}="srv-s">
								<Authentication ${id}="auth-s"/>
								<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s"/>
									<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-src" ${id}="xcbr-s"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<DataTypeTemplates ${id}="dtt-s">
						<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
						<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-s"/>
					</DataTypeTemplates>
				</SCL>
			`,
				groups: [
					{
						id: 'logical-node',
						change: 'added',
						title: 'added LN',
						primary: {
							change: 'added',
							tagName: 'LN',
							sourceRef: { tagName: 'LN', id: 'xcbr-s' },
							children: [],
						},
						companions: [],
						dependsOn: [],
						suggestedAction: 'accept',
					},
					{
						id: 'function-node',
						change: 'added',
						title: 'added LNode',
						primary: {
							change: 'added',
							tagName: 'LNode',
							sourceRef: { tagName: 'LNode', id: 'lnode-s' },
							children: [],
						},
						companions: [],
						dependsOn: [],
						suggestedAction: 'accept',
					},
				],
				expected: { 'logical-node': [], 'function-node': [] },
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		await linkPlacementDependencies(source.query, {
			instances: [instanceOf(testCase.groups)],
			index: new Map(),
		})
		const dependencies = Object.fromEntries(
			testCase.groups.map((group) => [group.id, group.dependsOn]),
		)
		expect(dependencies).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
