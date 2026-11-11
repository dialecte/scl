import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle - a linked category read from the project keeps its contributions', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'shared project category with a local classification → two contributions added once without overwriting project content':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-source">
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
								<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project" ${id}="project-category">
									<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function"/>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<VoltageLevel name="V1">
								<Bay name="B1" ${id}="first-bay">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:AllocationRole name="PIU" desc="project role" uuid="role-project"/>
									</Private>
									<Function name="Local" uuid="local-function"/>
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
					// the project category stays the only one, untouched
					'/default:SCL[count(.//v2019C1:FunctionCategory)=1]',
					'//v2019C1:FunctionCategory[@name="PROTECTION"][@uuid="category-project"][@desc="project category"]',
					// its classifications: the local one and one per instance, each once
					'/default:SCL[count(.//v2019C1:FunctionCatRef)=3]',
					'//v2019C1:FunctionCatRef[@functionUuid="local-function"]',
					`//v2019C1:FunctionCatRef[@functionUuid = //default:Bay[@name="B1"]/default:Function[@templateUuid="function-source"]/@uuid]`,
					`//v2019C1:FunctionCatRef[@functionUuid = //default:Bay[@name="B2"]/default:Function/@uuid]`,
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
		// the template file is only read
		const sourceAfter = await source.query.getSnapshot({ as: 'xml' })
		expect(sourceAfter).toBe(sourceBefore)
		// the project's own element, not a look-alike written in its place
		const [category] = await target.query.getRecordsByTagName('FunctionCategory')
		expect(category?.id).toBe('project-category')
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
