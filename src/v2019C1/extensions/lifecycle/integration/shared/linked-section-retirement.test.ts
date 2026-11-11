import { findByName, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle - updating one instance out of a retired category keeps the other contributions', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'retired template category shared by two instances and a local function → only the selected contribution removed':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source" ${id}="retired-category">
									<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source"/>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<VoltageLevel name="TEMPLATE">
								<Bay name="TEMPLATE">
									<Function name="Prot" uuid="function-source" ${id}="template-function"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Header id="project" uuid="project-file"/>
						<Substation name="S1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project">
									<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function" ${id}="project-classification"/>
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
					// the retired category keeps the second instance and the local function, nothing else
					`//v2019C1:FunctionCategory[@name="MEASUREMENT"][count(v2019C1:FunctionCatRef)=2]`,
					`//v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@functionUuid="local-function"]`,
					`//v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@functionUuid = //default:Bay[@name="B2"]/default:Function/@uuid]`,
					// the project category keeps its own classification
					'//v2019C1:FunctionCategory[@uuid="category-project"]/v2019C1:FunctionCatRef[@functionUuid="local-function"]',
				],
				unexpectedQueries: [
					`//v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@functionUuid = //default:Bay[@name="B1"]/default:Function[@templateUuid="function-source"]/@uuid]`,
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceBefore = await source.query.getSnapshot({ as: 'xml' })
		const placement: LifecycleTarget = {
			verb: 'fsd',
			scenario: 'instantiate',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'template-function' } as Scl.Ref<'Function'>,
			anchor: { tagName: 'Bay', id: 'first-bay' } as Scl.Ref<'Bay'>,
		}
		await reportAndApply({ document: target, lifecycle: placement })
		await reportAndApply({
			document: target,
			lifecycle: { ...placement, anchor: { tagName: 'Bay', id: 'second-bay' } as Scl.Ref<'Bay'> },
		})
		const sourceAfterPlacement = await source.query.getSnapshot({ as: 'xml' })
		expect(sourceAfterPlacement).toBe(sourceBefore)

		// the placed category also classifies a project function
		const category = await findByName(target.query, {
			tagName: 'FunctionCategory',
			name: 'MEASUREMENT',
		})
		const categoryBefore = await target.query.getAttributes(category)
		await target.transaction(async function classifyForeignFunction(tx) {
			await tx.addChild(category, {
				tagName: 'FunctionCatRef',
				attributes: { function: 'S1/V1/B1/Local', functionUuid: 'local-function' },
			})
		})
		// the template's next revision retires the category
		await source.transaction(async function retireClassification(tx) {
			await tx.delete({ tagName: 'FunctionCategory', id: 'retired-category' })
			await tx.update(placement.ref, { attributes: { desc: 'revision 2' } })
		})
		const revisedSource = await source.query.getSnapshot({ as: 'xml' })
		const { Function: firstBayFunctions = [] } = await target.query.findDescendants(
			placement.anchor,
			{ collect: 'Function' },
		)
		const targetInstance = firstBayFunctions.find((record) => record.id !== 'local-function')
		if (!targetInstance) throw new Error('first instance required')

		await reportAndApply({
			document: target,
			lifecycle: { ...placement, scenario: 'template', targetInstance },
		})

		const revisedSourceAfter = await source.query.getSnapshot({ as: 'xml' })
		expect(revisedSourceAfter).toBe(revisedSource)
		const categoryAfter = await target.query.getAttributes(category)
		expect(categoryAfter).toEqual(categoryBefore)
		const projectClassification = await target.query.getAttributes({
			tagName: 'FunctionCatRef',
			id: 'project-classification',
		})
		expect(projectClassification.functionUuid).toBe('local-function')
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
