import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle - satellites of two function instances keep one identity per instance', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two function instances with satellites → distinct identities and only the selected instance updated':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="variable-source" ${id}="template-variable">
									<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source"/>
								</eIEC61850-6-100:Variable>
								<eIEC61850-6-100:BehaviorDescription name="LOGIC" uuid="behavior-source" ${id}="template-behavior">
									<eIEC61850-6-100:InputVar varName="input" dataName="TEMPLATE/Prot/CSWI1" lnodeUuid="lnode-source" doName="Pos"/>
								</eIEC61850-6-100:BehaviorDescription>
							</Private>
							<VoltageLevel name="TEMPLATE">
								<Bay name="TEMPLATE">
									<Function name="Prot" uuid="function-source" ${id}="template-function">
										<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-source"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="CSWI_Type" lnClass="CSWI">
								<DO name="Pos" type="DPC_Type"/>
							</LNodeType>
							<DOType id="DPC_Type" cdc="DPC">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Header id="project" uuid="project-file"/>
						<Substation name="S1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project">
									<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function"/>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<VoltageLevel name="V1">
								<Bay name="B1" ${id}="first-bay">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:AllocationRole name="PIU" desc="project role" uuid="role-project"/>
									</Private>
									<Function name="Local" uuid="local-function" ${id}="local-function"/>
								</Bay>
								<Bay name="B2" ${id}="second-bay"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					// two instances, each with its own identity
					`//default:Bay[@name="B1"]/default:Function[@templateUuid="function-source"][@name="Prot"][@uuid != //default:Bay[@name="B2"]/default:Function/@uuid]`,
					'//default:Bay[@name="B2"][count(default:Function)=1]',
					// two variables made from the template one, each its own element
					'/default:SCL[count(.//v2019C1:Variable)=2][count(.//v2019C1:Variable[@templateUuid="variable-source"])=2]',
					'//v2019C1:Variable[@uuid != following::v2019C1:Variable/@uuid]',
					'/default:SCL[count(.//v2019C1:VariableApplyTo)=2]',
					// the first instance's variable took the revision, the second's did not
					'/default:SCL[count(.//v2019C1:Variable[@desc="new variable"])=1][count(.//v2019C1:Variable[not(@desc)])=1]',
					`//v2019C1:Variable[@desc="new variable"]/v2019C1:VariableApplyTo[@elementUuid = //default:Bay[@name="B1"]/default:Function[@templateUuid="function-source"]/@uuid]`,
					`//v2019C1:Variable[not(@desc)]/v2019C1:VariableApplyTo[@elementUuid = //default:Bay[@name="B2"]/default:Function/@uuid]`,
					// the same for the behaviour descriptions, bound to each instance's LNode
					'/default:SCL[count(.//v2019C1:BehaviorDescription)=2][count(.//v2019C1:BehaviorDescription[@templateUuid="behavior-source"])=2]',
					'//v2019C1:BehaviorDescription[@uuid != following::v2019C1:BehaviorDescription/@uuid]',
					'/default:SCL[count(.//v2019C1:InputVar)=2][count(.//default:LNode)=2]',
					'/default:SCL[count(.//v2019C1:BehaviorDescription[@desc="new behavior"])=1][count(.//v2019C1:BehaviorDescription[not(@desc)])=1]',
					`//v2019C1:BehaviorDescription[@desc="new behavior"]/v2019C1:InputVar[@lnodeUuid = //default:Bay[@name="B1"]/default:Function[@templateUuid="function-source"]/default:LNode/@uuid]`,
					`//v2019C1:BehaviorDescription[not(@desc)]/v2019C1:InputVar[@lnodeUuid = //default:Bay[@name="B2"]/default:Function/default:LNode/@uuid]`,
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceBefore = await source.query.getSnapshot({ as: 'xml' })
		const firstBay = { tagName: 'Bay', id: 'first-bay' } as Scl.Ref<'Bay'>
		const secondBay = { tagName: 'Bay', id: 'second-bay' } as Scl.Ref<'Bay'>
		const placement: LifecycleTarget = {
			verb: 'fsd',
			scenario: 'instantiate',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'template-function' } as Scl.Ref<'Function'>,
			anchor: firstBay,
		}
		await reportAndApply({ document: target, lifecycle: placement })
		await reportAndApply({ document: target, lifecycle: { ...placement, anchor: secondBay } })
		const sourceAfterPlacement = await source.query.getSnapshot({ as: 'xml' })
		expect(sourceAfterPlacement).toBe(sourceBefore)

		const before = await readSatelliteState({ target, secondBay })
		// the template's next revision describes both satellites
		await source.transaction(async function reviseSatellites(tx) {
			await tx.update(
				{ tagName: 'Variable', id: 'template-variable' },
				{ attributes: { desc: 'new variable' } },
			)
			await tx.update(
				{ tagName: 'BehaviorDescription', id: 'template-behavior' },
				{ attributes: { desc: 'new behavior' } },
			)
		})
		const revisedSource = await source.query.getSnapshot({ as: 'xml' })
		const { Function: firstBayFunctions = [] } = await target.query.findDescendants(firstBay, {
			collect: 'Function',
		})
		const targetInstance = firstBayFunctions.find((record) => record.id !== 'local-function')
		if (!targetInstance) throw new Error('first instance required')

		await reportAndApply({
			document: target,
			lifecycle: { ...placement, scenario: 'template', targetInstance },
		})

		const revisedSourceAfter = await source.query.getSnapshot({ as: 'xml' })
		expect(revisedSourceAfter).toBe(revisedSource)
		// beyond the new description, nothing of the satellites, their references or the second bay changed
		const after = await readSatelliteState({ target, secondBay })
		expect(after.secondBayTree).toEqual(before.secondBayTree)
		expect(after.references).toEqual(before.references)
		expect(after.satellites.map((satellite) => satellite.ref.id)).toEqual(
			before.satellites.map((satellite) => satellite.ref.id),
		)
		expect(after.satellites.map(withoutDescription)).toEqual(
			before.satellites.map(withoutDescription),
		)
		const untouched = after.satellites.filter(
			(satellite) => satellite.attributes.desc === undefined,
		)
		expect(untouched).toEqual(
			before.satellites.filter((satellite) =>
				untouched.some((kept) => kept.ref.id === satellite.ref.id),
			),
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The satellites of the project with their attributes and subtree, their references, and the second bay. */
async function readSatelliteState(params: {
	target: NonNullable<SclTest.ActParams<SclTest.BaseXmlTestCase>['target']>
	secondBay: Scl.Ref<'Bay'>
}) {
	const { target, secondBay } = params
	const records = [
		...(await target.query.getRecordsByTagName('Variable')),
		...(await target.query.getRecordsByTagName('BehaviorDescription')),
	]
	const satellites = []
	for (const ref of records) {
		const attributes = await target.query.getAttributes(ref)
		const tree = await target.query.getTree(ref)
		satellites.push({ ref, attributes, tree })
	}
	const referenceRecords = [
		...(await target.query.getRecordsByTagName('VariableApplyTo')),
		...(await target.query.getRecordsByTagName('InputVar')),
	]
	const references = await Promise.all(
		referenceRecords.map((record) => target.query.any.getAttributes(record)),
	)
	const secondBayTree = await target.query.getTree(secondBay)
	return { satellites, references, secondBayTree }
}

function withoutDescription(satellite: { attributes: Record<string, unknown> }) {
	const { desc: _desc, ...attributes } = satellite.attributes
	return attributes
}
