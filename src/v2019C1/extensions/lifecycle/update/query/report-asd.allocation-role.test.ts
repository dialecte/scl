import { reportAsd } from './report-asd'

import { describe, expect } from 'vitest'

import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const allocationRoleRef = { tagName: 'AllocationRole', id: 'ar-s' } as Scl.Ref<'AllocationRole'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { mutate: (tx: Scl.Transaction) => Promise<void> }

// An Application that references an AllocationRole. The AllocationRole lives at
// Substation level (OUTSIDE the Application subtree) and is referenced outward by
// AllocationRoleRef — the application-layer satellite. It must travel with the
// application's decision group on update/report, not just on instantiate.
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

describe('reportAsd — carried AllocationRole (application-layer satellite)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"a change to a referenced AllocationRole is a companion of the application's group": {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update(applicationRef, { attributes: { desc: 'updated application' } })
				await tx.update(allocationRoleRef, { attributes: { desc: 'updated allocation role' } })
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})
		await source.transaction(testCase.mutate)

		const report = await reportAsd(target.query, { sourceQuery: source.query, applicationRef })

		const applicationGroup = report.groups.find((group) => group.primary.tagName === 'Application')
		expect(applicationGroup).toBeDefined()

		const companionTags = applicationGroup!.companions.map((node) => node.tagName)
		expect(companionTags).toContain('AllocationRole')
	}

	runSclTestCases.withoutExport({ testCases, act })
})
