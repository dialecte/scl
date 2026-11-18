import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup, DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceRootRef = { tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>
const instanceRootRef = { tagName: 'Function', id: 'fn-t' } as Scl.Ref<'Function'>

describe('pairing of the uuid-less references of a function by their key', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each decision group: `<change> <tag>:<instance or source id> <suggested action>`. */
		expectedGroups: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'two data objects of a logical node no device implements, written in the other order → each paired with the one of its name, nothing listed':
			{
				// neither LNode is bound: its data objects name nothing by uuid
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE" ${id}="sub-s">
							<VoltageLevel name="TEMPLATE" ${id}="vl-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Breaker" uuid="fn-src" ${id}="fn-s">
										<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="ln-src" ${id}="ln-s">
											<Private type="eIEC61850-6-100" ${id}="ln-private-s">
												<eIEC61850-6-100:DOS name="Pos" desc="position" ${id}="pos-s"/>
												<eIEC61850-6-100:DOS name="BlkOpn" desc="opening block" ${id}="blk-s"/>
											</Private>
										</LNode>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" ${id}="bay-t">
									<Function name="Breaker" uuid="fn-ins" templateUuid="fn-src" ${id}="fn-t">
										<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="ln-ins" templateUuid="ln-src" ${id}="ln-t">
											<Private type="eIEC61850-6-100" ${id}="ln-private-t">
												<eIEC61850-6-100:DOS name="BlkOpn" desc="opening block" ${id}="blk-t"/>
												<eIEC61850-6-100:DOS name="Pos" desc="position" ${id}="pos-t"/>
											</Private>
										</LNode>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedGroups: [],
			},
		'two function references written by a path naming no function of the files, in the other order → each paired with the one of its path, nothing listed':
			{
				// the paths name functions neither file holds: the references name nothing by uuid
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE" ${id}="sub-s">
							<VoltageLevel name="TEMPLATE" ${id}="vl-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Breaker" uuid="fn-src" ${id}="fn-s">
										<Private type="eIEC61850-6-100" ${id}="fn-private-s">
											<eIEC61850-6-100:FunctionRef function="S9/V9/B9/Prot" desc="protection" ${id}="prot-s"/>
											<eIEC61850-6-100:FunctionRef function="S9/V9/B9/Ctrl" desc="control" ${id}="ctrl-s"/>
										</Private>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" ${id}="bay-t">
									<Function name="Breaker" uuid="fn-ins" templateUuid="fn-src" ${id}="fn-t">
										<Private type="eIEC61850-6-100" ${id}="fn-private-t">
											<eIEC61850-6-100:FunctionRef function="S9/V9/B9/Ctrl" desc="control" ${id}="ctrl-t"/>
											<eIEC61850-6-100:FunctionRef function="S9/V9/B9/Prot" desc="protection" ${id}="prot-t"/>
										</Private>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedGroups: [],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
		})
		expect(report.groups.map(describeGroup).sort()).toEqual(testCase.expectedGroups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('pairing of identical uuid-less elements of a function', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The nodes paired among identical elements, as `<instance id> <- <source id>`. */
		expectedTwins: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the same label written twice in the template and the instance → paired in order, both said paired among identical ones':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE" ${id}="sub-s">
							<VoltageLevel name="TEMPLATE" ${id}="vl-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Breaker" uuid="fn-src" ${id}="fn-s">
										<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="ln-src" ${id}="ln-s">
											<Private type="eIEC61850-6-100" ${id}="ln-private-s">
												<eIEC61850-6-100:DOS name="Pos" ${id}="pos-s">
													<eIEC61850-6-100:Labels ${id}="labels-s">
														<Label lang="en" ${id}="label-1-s">Position</Label>
														<Label lang="en" ${id}="label-2-s">Position</Label>
													</eIEC61850-6-100:Labels>
												</eIEC61850-6-100:DOS>
											</Private>
										</LNode>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" ${id}="bay-t">
									<Function name="Breaker" uuid="fn-ins" templateUuid="fn-src" ${id}="fn-t">
										<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="ln-ins" templateUuid="ln-src" ${id}="ln-t">
											<Private type="eIEC61850-6-100" ${id}="ln-private-t">
												<eIEC61850-6-100:DOS name="Pos" ${id}="pos-t">
													<eIEC61850-6-100:Labels ${id}="labels-t">
														<Label lang="en" ${id}="label-1-t">Position</Label>
														<Label lang="en" ${id}="label-2-t">Position</Label>
													</eIEC61850-6-100:Labels>
												</eIEC61850-6-100:DOS>
											</Private>
										</LNode>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedTwins: ['label-1-t <- label-1-s', 'label-2-t <- label-2-s'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
		})
		expect(twinsOf(report.root).sort()).toEqual(testCase.expectedTwins)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A decision group as `<change> <tag>:<instance or source id> <suggested action>`. */
function describeGroup(group: DecisionGroup): string {
	const primary = group.primary.instanceRef ?? group.primary.sourceRef
	return `${group.change} ${group.primary.tagName}:${primary?.id} ${group.suggestedAction}`
}

/** The nodes of a tree paired among identical elements, as `<instance id> <- <source id>`. */
function twinsOf(node: DiffNode): string[] {
	const own = node.pairedAmongTwins ? [`${node.instanceRef?.id} <- ${node.sourceRef?.id}`] : []
	return [...own, ...node.children.flatMap(twinsOf)]
}
