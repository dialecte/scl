import { findByName, forkInTurn, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle - a repeated fork reuses the identity of the source', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'template placement followed by repeated fork → fresh lineage then source identity reused without duplicates':
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
								<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project">
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
					// the template placement has a fresh identity and its lineage
					`//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="function-source"][@uuid != ""][@uuid != "function-source"]`,
					// the fork keeps the source identity, once, however often it runs
					'/default:SCL[count(.//default:Function[@uuid="function-source"])=1]',
					'//default:Bay[@name="B2"]/default:Function[@uuid="function-source"]',
					'/default:SCL[count(.//default:Function)=3]',
					// the local function, the fork and the placement are each classified once
					'/default:SCL[count(.//v2019C1:FunctionCatRef)=3]',
					'//v2019C1:FunctionCatRef[@functionUuid="local-function"]',
					'//v2019C1:FunctionCatRef[@functionUuid="function-source"]',
					`//v2019C1:FunctionCatRef[@functionUuid = //default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="function-source"]/@uuid]`,
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const placement: LifecycleTarget = {
			verb: 'fsd',
			scenario: 'instantiate',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'template-function' } as Scl.Ref<'Function'>,
			anchor: { tagName: 'Bay', id: 'first-bay' } as Scl.Ref<'Bay'>,
		}
		await reportAndApply({ document: target, lifecycle: placement })
		const placed = await findByName(target.query, { tagName: 'Function', name: 'Prot' })
		const placedBefore = await target.query.getAttributes(placed)

		await forkInTurn({
			turns: 2,
			document: target,
			lifecycle: {
				...placement,
				scenario: 'fork',
				anchor: { tagName: 'Bay', id: 'second-bay' } as Scl.Ref<'Bay'>,
			},
		})

		// the earlier placement keeps its identity
		const placedAfter = await target.query.getAttributes(placed)
		expect(placedAfter).toEqual(placedBefore)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
