import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const allocationRoleRefRef = {
	tagName: 'AllocationRoleRef',
	id: 'arref-s',
} as Scl.Ref<'AllocationRoleRef'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

// Application references one AllocationRole (HMI_PC) carried on instantiate.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="ar-src-uuid" ${id}="ar-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="ar-fref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar-src-uuid" ${id}="arref-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

const skipAll =
	() =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.map((g) => [g.id, 'skip'] as const))

// The application un-allocates from the role: the AllocationRoleRef link is
// dropped, but the AllocationRole catalog element stays in the template.
const mutate = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(applicationRef, { attributes: { desc: 'no longer allocates HMI_PC' } })
	await tx.delete(allocationRoleRefRef)
}

describe('lifecycle.apply — dropping an AllocationRoleRef link (catalog AllocationRole stays)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting removes the AllocationRoleRef but keeps the catalog AllocationRole': {
			sourceXml,
			targetXml,
			mutate,
			decide: () => new Map(),
			expectedQueries: ['//v2019C1:AllocationRole[@templateUuid="ar-src-uuid"][@name="HMI_PC"]'],
			unexpectedQueries: ['//v2019C1:AllocationRoleRef'],
		},

		'skipping keeps both the link and the AllocationRole': {
			sourceXml,
			targetXml,
			mutate,
			decide: skipAll(),
			expectedQueries: ['//v2019C1:AllocationRoleRef', '//v2019C1:AllocationRole[@name="HMI_PC"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})
		await source.transaction(testCase.mutate)

		const rep = await report(target.query, {
			verb: 'asd',
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'asd',
				sourceQuery: source.query,
				ref: applicationRef,
				anchor: bayRef,
				report: rep,
				decisions: testCase.decide(allGroups(rep)),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
