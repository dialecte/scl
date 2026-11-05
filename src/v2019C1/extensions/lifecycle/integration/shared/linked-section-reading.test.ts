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

const categoryXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-source" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source" ${id}="classification-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="target">
		<Header id="project" uuid="project-file" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project category" uuid="category-project" ${id}="category-t">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function" ${id}="classification-t"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-1">
					<Private type="eIEC61850-6-100" ${id}="bay-private-t">
						<eIEC61850-6-100:AllocationRole name="PIU" desc="project role" uuid="role-project" ${id}="role-t"/>
					</Private>
					<Function name="Local" uuid="local-function" ${id}="local-t"/>
				</Bay>
				<Bay name="B2" ${id}="bay-2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const applicationsXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="PROT_APP" type="Protection" uuid="protection-application" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source" ${id}="application-function-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="application-role-s"/>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:Application name="CTRL_APP" type="Control" uuid="control-application" ${id}="control-application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="control-root-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="control-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source" ${id}="control-application-function-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="control-application-role-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source" ${id}="role-protection-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source" ${id}="role-control-s"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<Function name="Prot" uuid="function-source" ${id}="function-s"/>
					<Function name="Ctrl" uuid="control-source" ${id}="control-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const satellitesXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="variable-source" ${id}="variable-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source" ${id}="variable-apply-s"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:BehaviorDescription name="LOGIC" uuid="behavior-source" ${id}="behavior-s">
					<eIEC61850-6-100:InputVar varName="input" dataName="TEMPLATE/Prot/CSWI1" lnodeUuid="lnode-source" doName="Pos" ${id}="input-s"/>
				</eIEC61850-6-100:BehaviorDescription>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source" ${id}="function-s">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-source" ${id}="lnode-s"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="types-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnode-type-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="do-type-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

const cascadeXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="B9" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="P_App" uuid="application-source" ${id}="application-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/Prot" functionUuid="function-source" ${id}="function-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/PICKUP" variableUuid="variable-source" ${id}="variable-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="variable-source" ${id}="variable-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/Alone" elementUuid="alone-source" ${id}="variable-apply-s"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<Function name="Prot" uuid="function-source" ${id}="function-s"/>
					<Function name="Alone" uuid="alone-source" ${id}="alone-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('lifecycle - linked section reading preserves contributions and instance identity', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		behavior: 'category' | 'retirement' | 'role' | 'satellites' | 'refusal' | 'fork'
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'shared project category with a local classification -> two contributions added once without overwriting project content':
			{
				sourceXml: categoryXml,
				targetXml: projectXml,
				behavior: 'category',
			},
		'retired template category shared by two instances and a local function -> only the selected contribution removed':
			{
				sourceXml: categoryXml.replace('name="PROTECTION"', 'name="MEASUREMENT"'),
				targetXml: projectXml,
				behavior: 'retirement',
			},
		'two applications sharing a project role -> each allocation retained once without overwriting the role':
			{
				sourceXml: applicationsXml,
				targetXml: projectXml,
				behavior: 'role',
			},
		'two function instances with satellites -> distinct identities and only the selected instance updated':
			{
				sourceXml: satellitesXml,
				targetXml: projectXml,
				behavior: 'satellites',
			},
		'bay cascade with a skipped required function -> application satellite refused and both documents unchanged':
			{
				sourceXml: cascadeXml,
				targetXml: projectXml,
				behavior: 'refusal',
			},
		'template placement followed by repeated fork -> fresh lineage then source identity reused without duplicates':
			{
				sourceXml: categoryXml,
				targetXml: projectXml,
				behavior: 'fork',
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sourceXmlBefore = await source.query.getSnapshot({ as: 'xml' })
		const firstBay = { tagName: 'Bay', id: 'bay-1' } as Scl.Ref<'Bay'>
		const secondBay = { tagName: 'Bay', id: 'bay-2' } as Scl.Ref<'Bay'>
		const functionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
		const placement: LifecycleTarget = {
			verb: 'fsd',
			scenario: 'instantiate',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: firstBay,
		}

		if (
			testCase.behavior === 'category' ||
			testCase.behavior === 'retirement' ||
			testCase.behavior === 'satellites'
		) {
			await expect(
				reportAndApply({ document: target, lifecycle: placement }),
			).resolves.toHaveProperty('applied')
			await expect(
				reportAndApply({
					document: target,
					lifecycle: { ...placement, anchor: secondBay },
				}),
			).resolves.toHaveProperty('applied')
			const { Function: firstFunctions = [] } = await target.query.findDescendants(firstBay, {
				collect: 'Function',
			})
			const firstInstance = firstFunctions.find((record) => record.id !== 'local-t')
			expect(firstInstance).toBeDefined()
			if (!firstInstance) throw new Error('first instance required')
			const firstUuid = await target.query.getAttribute(firstInstance, { name: 'uuid' })
			const { Function: secondFunctions = [] } = await target.query.findDescendants(secondBay, {
				collect: 'Function',
			})
			expect(secondFunctions).toHaveLength(1)
			const secondUuid = await target.query.getAttribute(secondFunctions[0]!, { name: 'uuid' })
			expect(firstUuid).not.toBe(secondUuid)
			const sourceAfterPlacement = await source.query.getSnapshot({ as: 'xml' })
			expect(sourceAfterPlacement).toBe(sourceXmlBefore)

			if (testCase.behavior === 'category') {
				const categories = await target.query.getRecordsByTagName('FunctionCategory')
				expect(categories).toHaveLength(1)
				expect(categories[0]?.id).toBe('category-t')
				const attributes = await target.query.getAttributes(categories[0]!)
				expect(attributes).toMatchObject({ uuid: 'category-project', desc: 'project category' })
				const before = await target.query.getRecordsByTagName('FunctionCatRef')
				const beforeUuids = await Promise.all(
					before.map((record) => target.query.getAttribute(record, { name: 'functionUuid' })),
				)
				expect(beforeUuids.sort()).toEqual([firstUuid, secondUuid, 'local-function'].sort())
			} else if (testCase.behavior === 'retirement') {
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
				await source.transaction(async function retireClassification(tx) {
					await tx.delete({ tagName: 'FunctionCategory', id: 'category-s' })
					await tx.update(functionRef, { attributes: { desc: 'revision 2' } })
				})
				const revisedSourceBeforeUpdate = await source.query.getSnapshot({ as: 'xml' })
				await expect(
					reportAndApply({
						document: target,
						lifecycle: { ...placement, scenario: 'template', targetInstance: firstInstance },
					}),
				).resolves.toHaveProperty('applied')
				const revisedSourceAfterUpdate = await source.query.getSnapshot({ as: 'xml' })
				expect(revisedSourceAfterUpdate).toBe(revisedSourceBeforeUpdate)
				const { FunctionCatRef: after = [] } = await target.query.findDescendants(category, {
					collect: 'FunctionCatRef',
				})
				const afterUuids = await Promise.all(
					after.map((record) => target.query.getAttribute(record, { name: 'functionUuid' })),
				)
				expect(afterUuids.sort()).toEqual([secondUuid, 'local-function'].sort())
				const categoryAfter = await target.query.getAttributes(category)
				expect(categoryAfter).toEqual(categoryBefore)
				const foreignClassification = await target.query.getAttributes({
					tagName: 'FunctionCatRef',
					id: 'classification-t',
				})
				expect(foreignClassification.functionUuid).toBe('local-function')
			} else {
				for (const tagName of ['Variable', 'BehaviorDescription'] as const) {
					const records = await target.query.getRecordsByTagName(tagName)
					expect(records).toHaveLength(2)
					const attributes = await Promise.all(
						records.map((record) => target.query.getAttributes(record)),
					)
					expect(new Set(attributes.map((value) => value.uuid)).size).toBe(2)
					expect(attributes.map((value) => value.templateUuid)).toEqual([
						tagName === 'Variable' ? 'variable-source' : 'behavior-source',
						tagName === 'Variable' ? 'variable-source' : 'behavior-source',
					])
				}
				const references = await target.query.getRecordsByTagName('VariableApplyTo')
				const bindings = await Promise.all(
					references.map((record) => target.query.getAttribute(record, { name: 'elementUuid' })),
				)
				expect(bindings.sort()).toEqual([firstUuid, secondUuid].sort())
				const inputs = await target.query.getRecordsByTagName('InputVar')
				const inputBindings = await Promise.all(
					inputs.map((record) => target.query.getAttribute(record, { name: 'lnodeUuid' })),
				)
				const lnodes = await target.query.getRecordsByTagName('LNode')
				const lnodeUuids = await Promise.all(
					lnodes.map((record) => target.query.getAttribute(record, { name: 'uuid' })),
				)
				expect(inputBindings.sort()).toEqual(lnodeUuids.sort())
				const firstLnode = lnodes.find((record) => record.parent?.id === firstInstance.id)
				expect(firstLnode).toBeDefined()
				if (!firstLnode) throw new Error('first instance LNode required')
				const firstLnodeUuid = await target.query.getAttribute(firstLnode, { name: 'uuid' })
				const referenceAttributes = await Promise.all(
					[...references, ...inputs].map((record) => target.query.any.getAttributes(record)),
				)
				const satelliteBindings = []
				for (const reference of references) {
					const owner = await target.query.getAttribute(reference, { name: 'elementUuid' })
					const satellite = reference.parent
					if (satellite?.tagName !== 'Variable') throw new Error('variable parent required')
					const attributes = await target.query.getAttributes(satellite)
					const tree = await target.query.getTree(satellite)
					satelliteBindings.push({
						satellite,
						attributes,
						tree,
						selected: owner === firstUuid,
						description: 'new variable',
					})
				}
				for (const input of inputs) {
					const owner = await target.query.getAttribute(input, { name: 'lnodeUuid' })
					const satellite = input.parent
					if (satellite?.tagName !== 'BehaviorDescription')
						throw new Error('behavior parent required')
					const attributes = await target.query.getAttributes(satellite)
					const tree = await target.query.getTree(satellite)
					satelliteBindings.push({
						satellite,
						attributes,
						tree,
						selected: owner === firstLnodeUuid,
						description: 'new behavior',
					})
				}
				expect(satelliteBindings.filter((binding) => binding.selected)).toHaveLength(2)
				const secondTree = await target.query.getTree(secondBay)
				await source.transaction(async function reviseSatellites(tx) {
					await tx.update(
						{ tagName: 'Variable', id: 'variable-s' },
						{ attributes: { desc: 'new variable' } },
					)
					await tx.update(
						{ tagName: 'BehaviorDescription', id: 'behavior-s' },
						{ attributes: { desc: 'new behavior' } },
					)
				})
				const revisedSourceBeforeUpdate = await source.query.getSnapshot({ as: 'xml' })
				await expect(
					reportAndApply({
						document: target,
						lifecycle: { ...placement, scenario: 'template', targetInstance: firstInstance },
					}),
				).resolves.toHaveProperty('applied')
				const revisedSourceAfterUpdate = await source.query.getSnapshot({ as: 'xml' })
				expect(revisedSourceAfterUpdate).toBe(revisedSourceBeforeUpdate)
				const secondTreeAfter = await target.query.getTree(secondBay)
				expect(secondTreeAfter).toEqual(secondTree)
				const referenceAttributesAfter = await Promise.all(
					[...references, ...inputs].map((record) => target.query.any.getAttributes(record)),
				)
				expect(referenceAttributesAfter).toEqual(referenceAttributes)
				for (const binding of satelliteBindings) {
					const attributes = await target.query.getAttributes(binding.satellite)
					expect(attributes).toEqual({
						...binding.attributes,
						...(binding.selected ? { desc: binding.description } : {}),
					})
					if (!binding.selected) {
						const tree = await target.query.getTree(binding.satellite)
						expect(tree).toEqual(binding.tree)
					}
				}
				for (const tagName of ['Variable', 'BehaviorDescription'] as const) {
					const records = await target.query.getRecordsByTagName(tagName)
					const attributes = await Promise.all(
						records.map((record) => target.query.getAttributes(record)),
					)
					expect(attributes).toHaveLength(2)
					expect(
						attributes.filter(
							(value) => value.desc === (tagName === 'Variable' ? 'new variable' : 'new behavior'),
						),
					).toHaveLength(1)
					expect(attributes.filter((value) => value.desc === undefined)).toHaveLength(1)
				}
			}
		} else if (testCase.behavior === 'role') {
			for (const applicationId of ['application-s', 'control-application-s']) {
				await expect(
					reportAndApply({
						document: target,
						lifecycle: {
							...placement,
							verb: 'asd',
							ref: { tagName: 'Application', id: applicationId },
						},
					}),
				).resolves.toHaveProperty('applied')
			}
			const roles = await target.query.getRecordsByTagName('AllocationRole')
			expect(roles).toHaveLength(1)
			const roleAttributes = await target.query.getAttributes(roles[0]!)
			expect(roleAttributes).toMatchObject({ uuid: 'role-project', desc: 'project role' })
			const { FunctionRef: references = [] } = await target.query.findDescendants(roles[0]!, {
				collect: 'FunctionRef',
			})
			const paths = await Promise.all(
				references.map((record) => target.query.getAttribute(record, { name: 'function' })),
			)
			expect(paths.sort()).toEqual(['S1/V1/B1/Ctrl', 'S1/V1/B1/Prot'])
			const placedFunctions = await target.query.findByAttributes({
				tagName: 'Function',
				attributes: { templateUuid: 'function-source' },
			})
			const placedControls = await target.query.findByAttributes({
				tagName: 'Function',
				attributes: { templateUuid: 'control-source' },
			})
			expect(placedFunctions).toHaveLength(1)
			expect(placedControls).toHaveLength(1)
			const allocatedUuids = await Promise.all(
				references.map((record) => target.query.getAttribute(record, { name: 'functionUuid' })),
			)
			const placedUuids = await Promise.all(
				[...placedFunctions, ...placedControls].map((record) =>
					target.query.getAttribute(record, { name: 'uuid' }),
				),
			)
			expect(allocatedUuids.sort()).toEqual(placedUuids.sort())
			const allocations = await target.query.getRecordsByTagName('AllocationRoleRef')
			const roleUuids = await Promise.all(
				allocations.map((record) =>
					target.query.getAttribute(record, { name: 'allocationRoleUuid' }),
				),
			)
			expect(roleUuids).toEqual(['role-project', 'role-project'])
		} else if (testCase.behavior === 'refusal') {
			const beforeXml = await target.query.getSnapshot({ as: 'xml' })
			const lifecycle: LifecycleTarget = {
				verb: 'ssd',
				scenario: 'instantiate',
				sourceQuery: source.query,
				ref: { tagName: 'Bay', id: 'bay-s' },
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
			}
			const listed = await report(target.query, lifecycle)
			const required = allGroups(listed).filter(
				(group) => group.primary.sourceRef?.id === 'alone-s',
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
			const afterXml = await target.query.getSnapshot({ as: 'xml' })
			expect(afterXml).toBe(beforeXml)
			const sourceAfterRefusal = await source.query.getSnapshot({ as: 'xml' })
			expect(sourceAfterRefusal).toBe(sourceXmlBefore)

			await expect(
				target.transaction(async function acceptCascade(tx) {
					return apply(tx, { ...lifecycle, report: listed, resolution: { decisions: new Map() } })
				}),
			).resolves.toHaveProperty('report')
			const placedBay = await findByName(target.query, { tagName: 'Bay', name: 'B9' })
			const {
				Application: placedApplications = [],
				Function: placedFunctions = [],
				Variable: placedVariables = [],
			} = await target.query.findDescendants(placedBay, {
				collect: ['Application', 'Function', 'Variable'],
			})
			expect(placedApplications).toHaveLength(1)
			expect(placedFunctions).toHaveLength(2)
			expect(placedVariables).toHaveLength(1)
			const placedProtection = await findByName(target.query, { tagName: 'Function', name: 'Prot' })
			const placedAlone = await findByName(target.query, { tagName: 'Function', name: 'Alone' })
			const protectionIdentity = await target.query.getAttributes(placedProtection)
			const aloneIdentity = await target.query.getAttributes(placedAlone)
			const applicationIdentity = await target.query.getAttributes(placedApplications[0]!)
			const variableIdentity = await target.query.getAttributes(placedVariables[0]!)
			expect(applicationIdentity).toMatchObject({
				name: 'P_App',
				templateUuid: 'application-source',
			})
			expect(variableIdentity).toMatchObject({
				name: 'PICKUP',
				value: '1',
				templateUuid: 'variable-source',
			})
			expect(protectionIdentity.templateUuid).toBe('function-source')
			expect(aloneIdentity.templateUuid).toBe('alone-source')
			expect(protectionIdentity.uuid).toBeTruthy()
			expect(aloneIdentity.uuid).toBeTruthy()
			expect(variableIdentity.uuid).toBeTruthy()
			const {
				FunctionRole: roles = [],
				FunctionRef: functionReferences = [],
				VariableRef: variableReferences = [],
			} = await target.query.findDescendants(placedApplications[0]!, {
				collect: ['FunctionRole', 'FunctionRef', 'VariableRef'],
			})
			const roleNames = await Promise.all(
				roles.map((record) => target.query.getAttribute(record, { name: 'name' })),
			)
			expect(roleNames.sort()).toEqual(['ENGINEERING ELEMENTS', 'ROOT'])
			expect(functionReferences).toHaveLength(1)
			expect(variableReferences).toHaveLength(1)
			const functionBinding = await target.query.getAttributes(functionReferences[0]!)
			expect(functionBinding).toMatchObject({
				function: 'S1/V1/B9/Prot',
				functionUuid: protectionIdentity.uuid,
			})
			const variableBinding = await target.query.getAttributes(variableReferences[0]!)
			expect(variableBinding).toMatchObject({
				variable: 'S1/V1/B9/PICKUP',
				variableUuid: variableIdentity.uuid,
			})
			const { VariableApplyTo: targets = [] } = await target.query.findDescendants(
				placedVariables[0]!,
				{
					collect: 'VariableApplyTo',
				},
			)
			expect(targets).toHaveLength(1)
			const targetBinding = await target.query.getAttributes(targets[0]!)
			expect(targetBinding).toMatchObject({
				element: 'S1/V1/B9/Alone',
				elementUuid: aloneIdentity.uuid,
			})
			const sourceAfterCascade = await source.query.getSnapshot({ as: 'xml' })
			expect(sourceAfterCascade).toBe(sourceXmlBefore)
			const firstCascadeTree = await target.query.getTree(placedBay)

			await expect(
				reportAndApply({
					document: target,
					lifecycle,
					decide: function skipOnlyApplication(nextReport) {
						const applicationGroups = allGroups(nextReport).filter(
							(group) => group.primary.tagName === 'Application',
						)
						expect(applicationGroups).toHaveLength(1)
						return new Map(applicationGroups.map((group) => [group.id, 'skip'] as const))
					},
				}),
			).resolves.toHaveProperty('applied')
			const selectiveBay = await findByName(target.query, { tagName: 'Bay', name: 'B9_1' })
			const {
				Application: omittedApplications = [],
				Function: retainedFunctions = [],
				Variable: retainedVariables = [],
			} = await target.query.findDescendants(selectiveBay, {
				collect: ['Application', 'Function', 'Variable'],
			})
			expect(omittedApplications).toHaveLength(0)
			expect(retainedFunctions).toHaveLength(2)
			expect(retainedVariables).toHaveLength(1)
			const retainedIdentities = await Promise.all(
				retainedFunctions.map((record) => target.query.getAttributes(record)),
			)
			expect(retainedIdentities.map((attributes) => attributes.name).sort()).toEqual([
				'Alone',
				'Prot',
			])
			const retainedTarget = retainedIdentities.find((attributes) => attributes.name === 'Alone')
			expect(retainedTarget).toBeDefined()
			if (!retainedTarget) throw new Error('retained satellite target required')
			const retainedUuid = retainedTarget.uuid
			expect(retainedUuid).toBeTruthy()
			expect(retainedUuid).not.toBe(aloneIdentity.uuid)
			const { VariableApplyTo: retainedBindings = [] } = await target.query.findDescendants(
				retainedVariables[0]!,
				{
					collect: 'VariableApplyTo',
				},
			)
			expect(retainedBindings).toHaveLength(1)
			const retainedBinding = await target.query.getAttributes(retainedBindings[0]!)
			expect(retainedBinding).toMatchObject({
				element: 'S1/V1/B9_1/Alone',
				elementUuid: retainedUuid,
			})
			const firstCascadeAfterSelectiveSkip = await target.query.getTree(placedBay)
			expect(firstCascadeAfterSelectiveSkip).toEqual(firstCascadeTree)
		} else {
			await expect(
				reportAndApply({ document: target, lifecycle: placement }),
			).resolves.toHaveProperty('applied')
			const templateInstance = await findByName(target.query, { tagName: 'Function', name: 'Prot' })
			const templateIdentity = await target.query.getAttributes(templateInstance)
			expect(templateIdentity.uuid).toBeTruthy()
			expect(templateIdentity.uuid).not.toBe('function-source')
			expect(templateIdentity.templateUuid).toBe('function-source')
			for (let turn = 0; turn < 2; turn++) {
				await expect(
					reportAndApply({
						document: target,
						lifecycle: { ...placement, scenario: 'fork', anchor: secondBay },
					}),
				).resolves.toHaveProperty('applied')
			}
			const forks = await target.query.findByAttributes({
				tagName: 'Function',
				attributes: { uuid: 'function-source' },
			})
			expect(forks).toHaveLength(1)
			expect(forks[0]?.parent?.id).toBe(secondBay.id)
			const allFunctions = await target.query.getRecordsByTagName('Function')
			expect(allFunctions).toHaveLength(3)
			const identityAfter = await target.query.getAttributes(templateInstance)
			expect(identityAfter).toEqual(templateIdentity)
			const references = await target.query.getRecordsByTagName('FunctionCatRef')
			const bindings = await Promise.all(
				references.map((record) => target.query.getAttribute(record, { name: 'functionUuid' })),
			)
			expect(bindings.sort()).toEqual(
				['local-function', 'function-source', templateIdentity.uuid].sort(),
			)
		}
		// Revision cases intentionally edit the library; read-only placement and refusal must not.
		if (testCase.behavior !== 'retirement' && testCase.behavior !== 'satellites') {
			const sourceXmlAfter = await source.query.getSnapshot({ as: 'xml' })
			expect(sourceXmlAfter).toBe(sourceXmlBefore)
		}
	}

	runSclTestCases.withoutExport({ testCases, act })
})
