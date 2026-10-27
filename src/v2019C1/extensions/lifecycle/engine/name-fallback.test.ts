import { acceptedRefIds } from './decide'
import { diff } from './diff'
import { resolvePlaceholderLineages } from './placeholder-lineages'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { SCENARIO_POLICIES } from '@/v2019C1/extensions/lifecycle/scenario-policy.constants'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { ReferencesByName } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// A reference of the project whose uuids disagree with the template's pairs with it by the names of what both name
// only when the consumer asks for it, and only where the project's target carries a lineage the identity check flags
// as a placeholder: a uuid is an identity, a name is not.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const PLACEHOLDER = '123e4567-e89b-12d3-a456-789012345678'
const UNFLAGGED_PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

const sourceApplication = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const instanceApplication = {
	tagName: 'Application',
	id: 'application-t',
} as Scl.Ref<'Application'>
const sourceRole = { tagName: 'AllocationRole', id: 'role-s' } as Scl.Ref<'AllocationRole'>
const instanceRole = { tagName: 'AllocationRole', id: 'role-t' } as Scl.Ref<'AllocationRole'>

/** An application referring to its role PIU, which allocates its function. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" uuid="application-source" ${id}="application-s">
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="role-ref-s"/>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source" ${id}="role-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="function-source" ${id}="function-ref-s"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
			<Function name="Prot" uuid="function-source" ${id}="function-s"/>
		</Substation>
	</SCL>
`

/**
 * The instance of the application refers to a role (`roleName`, default PIU) whose lineage is `roleLineage`, not the template role's uuid;
 * `substationLineage` gives the substation a lineage (the same value on a second type makes it a flagged placeholder);
 * the role also allocates the function of another instance, named like the template's, whose lineage is
 * `otherFunctionLineage` — a subfunction of a function of its own when `otherIsSubFunction`.
 */
function projectXml(params: {
	roleLineage: string
	roleName?: string
	substationLineage?: string
	otherFunctionLineage?: string
	otherIsSubFunction?: boolean
}): string {
	const { roleLineage, substationLineage, otherFunctionLineage, otherIsSubFunction } = params
	const roleName = params.roleName ?? 'PIU'
	const substationTemplate = substationLineage ? ` templateUuid="${substationLineage}"` : ''
	const otherFunction = !otherFunctionLineage
		? ''
		: otherIsSubFunction
			? /* xml */ `
				<Function name="Host" uuid="host-other" ${id}="host-other-t">
					<SubFunction name="Prot" uuid="function-other" templateUuid="${otherFunctionLineage}" ${id}="function-other-t"/>
				</Function>
			`
			: /* xml */ `<Function name="Prot" uuid="function-other" templateUuid="${otherFunctionLineage}" ${id}="function-other-t"/>`
	const otherFunctionPath = otherIsSubFunction ? 'S2/Host/Prot' : 'S2/Prot'
	const otherFunctionRef = otherFunctionLineage
		? /* xml */ `<eIEC61850-6-100:FunctionRef function="${otherFunctionPath}" functionUuid="function-other" ${id}="function-ref-other-t"/>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Substation name="S1"${substationTemplate} ${id}="substation-t">
				<Private type="eIEC61850-6-100" ${id}="private-t">
					<eIEC61850-6-100:Application name="HMI" uuid="application-instance" templateUuid="application-source" ${id}="application-t">
						<eIEC61850-6-100:AllocationRoleRef allocationRole="S1/${roleName}" allocationRoleUuid="role-instance" ${id}="role-ref-t"/>
					</eIEC61850-6-100:Application>
					<eIEC61850-6-100:AllocationRole name="${roleName}" uuid="role-instance" templateUuid="${roleLineage}" ${id}="role-t">
						<eIEC61850-6-100:FunctionRef function="S1/Prot" functionUuid="function-instance" ${id}="function-ref-t"/>
						${otherFunctionRef}
					</eIEC61850-6-100:AllocationRole>
				</Private>
				<Function name="Prot" uuid="function-instance" templateUuid="function-source" ${id}="function-t"/>
			</Substation>
			<Substation name="S2" ${id}="substation-other-t">
				${otherFunction}
			</Substation>
		</SCL>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	referencesByName?: ReferencesByName
	/** What is compared: the application (its reference to the role), or the role (its references to functions). */
	compared: 'application' | 'role'
	/** The changes listed for the compared references, by instance (or source) record id, sorted. */
	expected: string[]
	/** The role's references once the reconcile wrote what the diff listed (its suggestions taken), sorted. */
	applied?: string[]
}

describe('engine diff — a reference pairs by name only on a flagged placeholder the consumer lets pair', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a placeholder lineage nothing flags, nothing asked → the reference is removed and the template one added':
			{
				sourceXml,
				targetXml: projectXml({ roleLineage: UNFLAGGED_PLACEHOLDER }),
				compared: 'application',
				expected: ['added role-ref-s', 'removed role-ref-t'],
			},
		'a placeholder lineage nothing flags, pairing by name asked → still removed and added': {
			sourceXml,
			targetXml: projectXml({ roleLineage: UNFLAGGED_PLACEHOLDER }),
			referencesByName: 'placeholders',
			compared: 'application',
			expected: ['added role-ref-s', 'removed role-ref-t'],
		},
		'a flagged placeholder, nothing asked → removed and added': {
			sourceXml,
			targetXml: projectXml({ roleLineage: PLACEHOLDER, substationLineage: PLACEHOLDER }),
			compared: 'application',
			expected: ['added role-ref-s', 'removed role-ref-t'],
		},
		'a flagged placeholder, pairing by name asked → paired, the pairing said': {
			sourceXml,
			targetXml: projectXml({ roleLineage: PLACEHOLDER, substationLineage: PLACEHOLDER }),
			referencesByName: 'placeholders',
			compared: 'application',
			expected: [`unchanged role-ref-t by name on ${PLACEHOLDER}`],
		},
		'a flagged placeholder, pairing asked, the names differ → removed and added': {
			sourceXml,
			targetXml: projectXml({
				roleLineage: PLACEHOLDER,
				roleName: 'OTHER',
				substationLineage: PLACEHOLDER,
			}),
			referencesByName: 'placeholders',
			compared: 'application',
			expected: ['added role-ref-s', 'removed role-ref-t'],
		},
		'a placeholder flagged elsewhere, pairing asked, the reference names an unflagged lineage → removed and added':
			{
				sourceXml,
				targetXml: projectXml({
					roleLineage: UNFLAGGED_PLACEHOLDER,
					substationLineage: PLACEHOLDER,
					otherFunctionLineage: PLACEHOLDER,
				}),
				referencesByName: 'placeholders',
				compared: 'application',
				expected: ['added role-ref-s', 'removed role-ref-t'],
			},
		"another instance's reference to a function of a placeholder lineage, nothing asked → removed":
			{
				sourceXml,
				targetXml: projectXml({
					roleLineage: 'role-source',
					substationLineage: PLACEHOLDER,
					otherFunctionLineage: PLACEHOLDER,
				}),
				compared: 'role',
				expected: ['removed function-ref-other-t', 'unchanged function-ref-t'],
				applied: ['function-ref-t'],
			},
		"another instance's reference to a function of a flagged placeholder, pairing asked → kept as its own":
			{
				sourceXml,
				targetXml: projectXml({
					roleLineage: 'role-source',
					substationLineage: PLACEHOLDER,
					otherFunctionLineage: PLACEHOLDER,
				}),
				referencesByName: 'placeholders',
				compared: 'role',
				expected: [
					`unchanged function-ref-other-t by name on ${PLACEHOLDER}`,
					'unchanged function-ref-t',
				],
				applied: ['function-ref-other-t', 'function-ref-t'],
			},
		"another instance's reference to a subfunction of a flagged placeholder, pairing asked → kept as its own":
			{
				sourceXml,
				targetXml: projectXml({
					roleLineage: 'role-source',
					substationLineage: PLACEHOLDER,
					otherFunctionLineage: PLACEHOLDER,
					otherIsSubFunction: true,
				}),
				referencesByName: 'placeholders',
				compared: 'role',
				expected: [
					`unchanged function-ref-other-t by name on ${PLACEHOLDER}`,
					'unchanged function-ref-t',
				],
				applied: ['function-ref-other-t', 'function-ref-t'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const placeholderLineages = await resolvePlaceholderLineages(target.query, {
			referencesByName: testCase.referencesByName,
		})
		const roots =
			testCase.compared === 'application'
				? { sourceRootRef: sourceApplication, instanceRootRef: instanceApplication }
				: { sourceRootRef: sourceRole, instanceRootRef: instanceRole }
		const compared = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			...roots,
			placeholderLineages,
		})
		const tagName = testCase.compared === 'application' ? 'AllocationRoleRef' : 'FunctionRef'
		const listed = collect(compared.root, tagName).map(describeReference).sort()
		expect(listed, 'report').toEqual(testCase.expected)
		if (!testCase.applied) return

		// the reconcile pairs as the diff did: what the diff keeps it keeps, what it removes it removes
		await target.transaction(async function write(tx) {
			await reconcile(tx, {
				sourceQuery: source.query,
				...roots,
				accepted: acceptedRefIds({ groups: compared.groups, decisions: new Map() }),
				matchKey: SCENARIO_POLICIES.template.matchKey,
				identityMode: SCENARIO_POLICIES.template.identityMode,
				bumpsCollisions: SCENARIO_POLICIES.template.bumpsCollisions,
				removalBase: { kind: 'lineage' },
				namesFollow: SCENARIO_POLICIES.template.namesFollow,
				placeholderLineages,
			})
		})
		const role = await target.query.getTree(instanceRole)
		const references = (role?.tree ?? []).map((child) => child.id).sort()
		expect(references, 'apply').toEqual(testCase.applied)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

function collect(node: DiffNode, tagName: string, out: DiffNode[] = []): DiffNode[] {
	if (node.tagName === tagName) out.push(node)
	for (const child of node.children) collect(child, tagName, out)
	return out
}

function describeReference(node: DiffNode): string {
	const element = node.instanceRef?.id ?? node.sourceRef?.id
	const byName = node.pairedByName ? ` by name on ${node.pairedByName}` : ''
	return `${node.change} ${element}${byName}`
}
