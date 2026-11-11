import { findByName, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file"/>
		<Substation name="S1">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" ${id}="project-level">
				<Bay name="B1">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole name="PIU" desc="project role" uuid="role-project"/>
					</Private>
					<Function name="Local" uuid="local-function"/>
				</Bay>
				<Bay name="B2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

function placeTemplateBay(source: SclTest.ActParams<TestCase>['source']): LifecycleTarget {
	return {
		verb: 'ssd',
		scenario: 'instantiate',
		sourceQuery: source.query,
		ref: { tagName: 'Bay', id: 'template-bay' } as Scl.Ref<'Bay'>,
		anchor: { tagName: 'VoltageLevel', id: 'project-level' } as Scl.Ref<'VoltageLevel'>,
	}
}

describe('lifecycle - a bay cascade links its satellites to the functions it places', () => {
	describe('refused', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'bay cascade with a skipped required function → application satellite refused and both documents unchanged':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="template">
							<Header id="template" uuid="template-file" version="0" revision="1"/>
							<Substation name="TEMPLATE">
								<VoltageLevel name="TEMPLATE">
									<Bay name="B9" uuid="bay-source" ${id}="template-bay">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:Application name="P_App" uuid="application-source">
												<eIEC61850-6-100:FunctionRole name="ROOT">
													<eIEC61850-6-100:FunctionRoleContent>
														<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/Prot" functionUuid="function-source"/>
													</eIEC61850-6-100:FunctionRoleContent>
												</eIEC61850-6-100:FunctionRole>
												<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS">
													<eIEC61850-6-100:FunctionRoleContent>
														<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/PICKUP" variableUuid="variable-source"/>
													</eIEC61850-6-100:FunctionRoleContent>
												</eIEC61850-6-100:FunctionRole>
											</eIEC61850-6-100:Application>
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="variable-source">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/Alone" elementUuid="alone-source"/>
											</eIEC61850-6-100:Variable>
										</Private>
										<Function name="Prot" uuid="function-source"/>
										<Function name="Alone" uuid="alone-source" ${id}="required-function"/>
									</Bay>
								</VoltageLevel>
							</Substation>
						</SCL>
					`,
					targetXml: projectXml,
				},
		}

		async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
			if (!target) throw new Error('target required')
			const sourceBefore = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
			const targetBefore = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
			const lifecycle = placeTemplateBay(source)
			const listed = await report(target.query, lifecycle)
			const required = allGroups(listed).filter(
				(group) => group.primary.sourceRef?.id === 'required-function',
			)
			expect(required).toHaveLength(1)
			const applications = allGroups(listed).filter(
				(group) => group.primary.tagName === 'Application',
			)
			expect(applications).toHaveLength(1)
			expect(applications[0]!.dependsOn).toContain(required[0]!.id)
			const decisions = new Map(required.map((group) => [group.id, 'skip'] as const))

			await expect(
				target.transaction(async function refuseCascade(tx) {
					await apply(tx, { ...lifecycle, report: listed, resolution: { decisions } })
				}),
			).rejects.toThrow(
				`decision accepts group "${applications[0]!.id}" but its dependency "${required[0]!.id}" is skipped`,
			)

			const targetAfter = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
			expect(targetAfter).toEqual(targetBefore)
			const sourceAfter = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
			expect(sourceAfter).toEqual(sourceBefore)
		}

		runSclTestCases.withoutExport({ testCases, act })
	})

	describe('accepted', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'bay cascade refused for a skipped required function, the same report then applied with nothing skipped → the bay placed with its satellites bound to the placed functions':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="template">
							<Header id="template" uuid="template-file" version="0" revision="1"/>
							<Substation name="TEMPLATE">
								<VoltageLevel name="TEMPLATE">
									<Bay name="B9" uuid="bay-source" ${id}="template-bay">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:Application name="P_App" uuid="application-source">
												<eIEC61850-6-100:FunctionRole name="ROOT">
													<eIEC61850-6-100:FunctionRoleContent>
														<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/Prot" functionUuid="function-source"/>
													</eIEC61850-6-100:FunctionRoleContent>
												</eIEC61850-6-100:FunctionRole>
												<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS">
													<eIEC61850-6-100:FunctionRoleContent>
														<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/PICKUP" variableUuid="variable-source"/>
													</eIEC61850-6-100:FunctionRoleContent>
												</eIEC61850-6-100:FunctionRole>
											</eIEC61850-6-100:Application>
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="variable-source">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/Alone" elementUuid="alone-source"/>
											</eIEC61850-6-100:Variable>
										</Private>
										<Function name="Prot" uuid="function-source"/>
										<Function name="Alone" uuid="alone-source" ${id}="required-function"/>
									</Bay>
								</VoltageLevel>
							</Substation>
						</SCL>
					`,
					targetXml: projectXml,
					expectedQueries: [
						// the bay holds one application, two functions and one variable
						`//default:Bay[@name="B9"][count(.//v2019C1:Application)=1][count(.//default:Function)=2][count(.//v2019C1:Variable)=1]`,
						`//default:Bay[@name="B9"]//v2019C1:Application[@name="P_App"][@templateUuid="application-source"]`,
						`//default:Bay[@name="B9"]//v2019C1:Variable[@name="PICKUP"][@value="1"][@templateUuid="variable-source"][@uuid != ""]`,
						`//default:Bay[@name="B9"]/default:Function[@name="Prot"][@templateUuid="function-source"][@uuid != ""]`,
						`//default:Bay[@name="B9"]/default:Function[@name="Alone"][@templateUuid="alone-source"][@uuid != ""]`,
						// the application keeps its two roles and points at what the bay placed
						`//default:Bay[@name="B9"]//v2019C1:Application[@name="P_App"][count(.//v2019C1:FunctionRole)=2]`,
						`//default:Bay[@name="B9"]//v2019C1:Application[@name="P_App"]//v2019C1:FunctionRole[@name="ROOT"]`,
						`//default:Bay[@name="B9"]//v2019C1:Application[@name="P_App"]//v2019C1:FunctionRole[@name="ENGINEERING ELEMENTS"]`,
						`//default:Bay[@name="B9"]//v2019C1:Application[@name="P_App"][count(.//v2019C1:FunctionRef)=1]//v2019C1:FunctionRef[@function="S1/V1/B9/Prot"][@functionUuid = //default:Bay[@name="B9"]/default:Function[@name="Prot"]/@uuid]`,
						`//default:Bay[@name="B9"]//v2019C1:Application[@name="P_App"][count(.//v2019C1:VariableRef)=1]//v2019C1:VariableRef[@variable="S1/V1/B9/PICKUP"][@variableUuid = //default:Bay[@name="B9"]//v2019C1:Variable[@name="PICKUP"]/@uuid]`,
						// the variable applies to the placed function
						`//default:Bay[@name="B9"]//v2019C1:Variable[@name="PICKUP"][count(.//v2019C1:VariableApplyTo)=1]//v2019C1:VariableApplyTo[@element="S1/V1/B9/Alone"][@elementUuid = //default:Bay[@name="B9"]/default:Function[@name="Alone"]/@uuid]`,
					],
				},
		}

		async function act({
			source,
			target,
		}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
			if (!target) throw new Error('target required')
			const lifecycle = placeTemplateBay(source)
			const listed = await report(target.query, lifecycle)
			const required = allGroups(listed).filter(
				(group) => group.primary.sourceRef?.id === 'required-function',
			)
			const decisions = new Map(required.map((group) => [group.id, 'skip'] as const))
			await expect(
				target.transaction(async function refuseCascade(tx) {
					await apply(tx, { ...lifecycle, report: listed, resolution: { decisions } })
				}),
			).rejects.toThrow('is skipped')

			// the refusal left nothing behind: the same report still places everything
			await expect(
				target.transaction(async function acceptCascade(tx) {
					return apply(tx, { ...lifecycle, report: listed, resolution: { decisions: new Map() } })
				}),
			).resolves.toHaveProperty('report')
			return { assertOn: 'target' }
		}

		runSclTestCases.withExport({ testCases, act })
	})

	describe('placed again without its application', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'bay template already placed, second placement skipping only the application → functions and variable kept and bound to the new bay, first bay unchanged':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="template">
							<Header id="template" uuid="template-file" version="0" revision="1"/>
							<Substation name="TEMPLATE">
								<VoltageLevel name="TEMPLATE">
									<Bay name="B9" uuid="bay-source" ${id}="template-bay">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:Application name="P_App" uuid="application-source">
												<eIEC61850-6-100:FunctionRole name="ROOT">
													<eIEC61850-6-100:FunctionRoleContent>
														<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/Prot" functionUuid="function-source"/>
													</eIEC61850-6-100:FunctionRoleContent>
												</eIEC61850-6-100:FunctionRole>
												<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS">
													<eIEC61850-6-100:FunctionRoleContent>
														<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/PICKUP" variableUuid="variable-source"/>
													</eIEC61850-6-100:FunctionRoleContent>
												</eIEC61850-6-100:FunctionRole>
											</eIEC61850-6-100:Application>
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="variable-source">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/Alone" elementUuid="alone-source"/>
											</eIEC61850-6-100:Variable>
										</Private>
										<Function name="Prot" uuid="function-source"/>
										<Function name="Alone" uuid="alone-source"/>
									</Bay>
								</VoltageLevel>
							</Substation>
						</SCL>
					`,
					targetXml: projectXml,
					expectedQueries: [
						`//default:Bay[@name="B9_1"][count(.//default:Function)=2][count(.//v2019C1:Variable)=1]`,
						`//default:Bay[@name="B9_1"]/default:Function[@name="Prot"]`,
						`//default:Bay[@name="B9_1"]/default:Function[@name="Alone"][@uuid != ""][@uuid != //default:Bay[@name="B9"]/default:Function[@name="Alone"]/@uuid]`,
						`//default:Bay[@name="B9_1"]//v2019C1:Variable[count(.//v2019C1:VariableApplyTo)=1]//v2019C1:VariableApplyTo[@element="S1/V1/B9_1/Alone"][@elementUuid = //default:Bay[@name="B9_1"]/default:Function[@name="Alone"]/@uuid]`,
					],
					unexpectedQueries: [`//default:Bay[@name="B9_1"]//v2019C1:Application`],
				},
		}

		async function act({
			source,
			target,
		}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
			if (!target) throw new Error('target required')
			const lifecycle = placeTemplateBay(source)
			await reportAndApply({ document: target, lifecycle })
			const placedBay = await findByName(target.query, { tagName: 'Bay', name: 'B9' })
			const placedBayBefore = await target.query.getTree(placedBay)

			await reportAndApply({
				document: target,
				lifecycle,
				decide: function skipOnlyApplication(nextReport) {
					const applicationGroups = allGroups(nextReport).filter(
						(group) => group.primary.tagName === 'Application',
					)
					expect(applicationGroups).toHaveLength(1)
					return new Map(applicationGroups.map((group) => [group.id, 'skip'] as const))
				},
			})

			const placedBayAfter = await target.query.getTree(placedBay)
			expect(placedBayAfter).toEqual(placedBayBefore)
			return { assertOn: 'target' }
		}

		runSclTestCases.withExport({ testCases, act })
	})

	describe('the template file is only read', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'bay template placed with its cascade → the template file as it was': {
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="template">
					<Header id="template" uuid="template-file" version="0" revision="1"/>
					<Substation name="TEMPLATE">
						<VoltageLevel name="TEMPLATE">
							<Bay name="B9" uuid="bay-source" ${id}="template-bay">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:Application name="P_App" uuid="application-source">
										<eIEC61850-6-100:FunctionRole name="ROOT">
											<eIEC61850-6-100:FunctionRoleContent>
												<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/Prot" functionUuid="function-source"/>
											</eIEC61850-6-100:FunctionRoleContent>
										</eIEC61850-6-100:FunctionRole>
										<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS">
											<eIEC61850-6-100:FunctionRoleContent>
												<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/PICKUP" variableUuid="variable-source"/>
											</eIEC61850-6-100:FunctionRoleContent>
										</eIEC61850-6-100:FunctionRole>
									</eIEC61850-6-100:Application>
									<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="variable-source">
										<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/Alone" elementUuid="alone-source"/>
									</eIEC61850-6-100:Variable>
								</Private>
								<Function name="Prot" uuid="function-source"/>
								<Function name="Alone" uuid="alone-source"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				targetXml: projectXml,
			},
		}

		async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
			if (!target) throw new Error('target required')
			const templateBefore = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
			await reportAndApply({ document: target, lifecycle: placeTemplateBay(source) })
			const templateAfter = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
			expect(templateAfter).toEqual(templateBefore)
		}

		runSclTestCases.withoutExport({ testCases, act })
	})
})
