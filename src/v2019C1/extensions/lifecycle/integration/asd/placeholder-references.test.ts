import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { ReferencesByName } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// A project authored with a placeholder lineage: the instance of the template's role allocates a function Prot whose
// lineage is a value the identity check flags (carried by elements of two types), not the instance of the template's
// function Prot the application composes. An update pairs the role's reference with the template's by name only when
// the consumer asks for it: the report says so, and the apply writes what the report lists.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const PLACEHOLDER = '123e4567-e89b-12d3-a456-789012345678'

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const roleRef = { tagName: 'AllocationRole', id: 'role-t' } as Scl.Ref<'AllocationRole'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" uuid="function-role-source" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source" ${id}="application-function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="role-ref-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source" ${id}="role-function-ref-s"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<Function name="Prot" uuid="function-source" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" templateUuid="${PLACEHOLDER}" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-instance" templateUuid="application-source" ${id}="application-t">
					<eIEC61850-6-100:FunctionRole name="ROOT" uuid="function-role-instance" templateUuid="function-role-source" ${id}="function-role-t">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-t">
							<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="function-instance" ${id}="application-function-ref-t"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="S1/V1/B1/PIU" allocationRoleUuid="role-instance" ${id}="role-ref-t"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Private type="eIEC61850-6-100" ${id}="bay-private-t">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-instance" templateUuid="role-source" ${id}="role-t">
							<eIEC61850-6-100:FunctionRef function="S1/V1/B2/Prot" functionUuid="function-legacy" ${id}="role-function-ref-t"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<Function name="Prot" uuid="function-instance" templateUuid="function-source" ${id}="function-t"/>
				</Bay>
				<Bay name="B2" ${id}="bay-legacy-t">
					<Function name="Prot" uuid="function-legacy" templateUuid="${PLACEHOLDER}" ${id}="function-legacy-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	referencesByName?: ReferencesByName
	expected: {
		/** The changes the report lists for the role's function references, sorted: an unchanged one is not listed. */
		listed: string[]
		/** The warnings the report carries, as `<code> <reference> <lineage>`. */
		warnings: string[]
		/** The functions the role allocates once applied, sorted. */
		allocated: string[]
	}
}

describe('update of an application whose role allocates a function of a placeholder lineage', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"nothing asked → the role gains the allocation of the instance's function, the other one kept":
			{
				sourceXml,
				targetXml,
				expected: {
					listed: ['added role-function-ref-s'],
					warnings: [],
					allocated: ['function-instance', 'function-legacy'],
				},
			},
		'pairing by name asked → the allocation is read as the template one, the pairing reported': {
			sourceXml,
			targetXml,
			referencesByName: 'placeholders',
			expected: {
				listed: ['unchanged role-function-ref-t'],
				warnings: [`reference-paired-by-name role-function-ref-t ${PLACEHOLDER}`],
				allocated: ['function-legacy'],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'asd' as const,
			scenario: 'template' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}
		const resolution = testCase.referencesByName
			? { referencesByName: testCase.referencesByName }
			: {}
		const listed = await report(target.query, { ...lifecycleTarget, resolution })

		const roleReferences = new Set<string>()
		for (const instance of listed.instances) {
			const nodes = [
				instance.tree,
				...instance.groups.flatMap((group) => [group.primary, ...group.companions]),
			]
			for (const node of nodes) collectRoleReferences({ node, out: roleReferences })
		}
		expect([...roleReferences].sort(), 'report').toEqual(testCase.expected.listed)
		const warnings = listed.warnings?.map((warning) =>
			warning.code === 'reference-paired-by-name'
				? `${warning.code} ${warning.reference.id} ${warning.lineage}`
				: warning.code,
		)
		// a report that paired nothing by name carries no warnings at all
		expect(warnings, 'report: warnings').toEqual(
			testCase.expected.warnings.length > 0 ? testCase.expected.warnings : undefined,
		)

		await target.transaction(async function write(tx) {
			await apply(tx, {
				...lifecycleTarget,
				report: listed,
				resolution: { ...resolution, decisions: new Map() },
			})
		})
		const role = await target.query.getTree(roleRef)
		const allocated: string[] = []
		for (const reference of role?.tree ?? []) {
			const named = await target.query.getAttribute(reference, { name: 'functionUuid' })
			allocated.push(named ?? '')
		}
		expect(allocated.sort(), 'apply').toEqual(testCase.expected.allocated)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The role's function references a node lists, at any depth: the template's and the project's. */
function collectRoleReferences(params: { node: DiffNode; out: Set<string> }): void {
	const { node, out } = params
	const element = node.instanceRef?.id ?? node.sourceRef?.id ?? ''
	if (element.startsWith('role-function-ref')) out.add(`${node.change} ${element}`)
	for (const child of node.children) collectRoleReferences({ node: child, out })
}
