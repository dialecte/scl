import { asd as updateAsd } from './asd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const targetBayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// rev2 (source, ADD case): keeps AllocationRole HMI_PC and ADDS a new one, BAY_CTRL,
// both referenced by the Application.
const addSourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-v2">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" desc="rev2 role" uuid="ar-src-uuid" ${id}="ar-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="ar-fref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:AllocationRole name="BAY_CTRL" desc="added in rev2" uuid="ar2-src-uuid" ${id}="ar2-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="ar2-fref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar-src-uuid" ${id}="arref-s"/>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/BAY_CTRL" allocationRoleUuid="ar2-src-uuid" ${id}="arref2-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

// rev1 (target, ADD case): only HMI_PC, Application references only it.
const addTargetXml = /* xml */ `
	<SCL ${ns} ${id}="asd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-t">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" desc="rev1 role" uuid="ar-src-uuid" ${id}="ar-t">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="ar-fref-t"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-t">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-t">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-t">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-t"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar-src-uuid" ${id}="arref-t"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-t">
				<Bay name="TEMPLATE" ${id}="bay-t">
					<Function name="Prot" ${id}="fn-t" uuid="fn-src-uuid"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

// rev2 (source, DELETE case): the AllocationRole and its reference are removed.
const deleteSourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-v2-del">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('update.asd — fork carries the AllocationRole satellite keeping identity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a fork ADDS a new AllocationRole keeping its source uuid (no stamp)': {
			sourceXml: addSourceXml,
			targetXml: addTargetXml,
			expectedQueries: [
				// added satellite keeps its source uuid
				'//v2019C1:AllocationRole[@name="BAY_CTRL"][@uuid="ar2-src-uuid"]',
				// the pre-existing one is reconciled in place (uuid preserved)
				'//v2019C1:AllocationRole[@name="HMI_PC"][@uuid="ar-src-uuid"][@desc="rev2 role"]',
			],
			unexpectedQueries: [
				// fork keeps identity: no templateUuid stamped on any AllocationRole
				'//v2019C1:AllocationRole[@templateUuid]',
			],
		},
		'a fork DELETES an AllocationRole the revision removed': {
			sourceXml: deleteSourceXml,
			targetXml: addTargetXml,
			unexpectedQueries: [
				// the retired satellite is gone (delete detection matches the instance by uuid under fork)
				'//v2019C1:AllocationRole[@uuid="ar-src-uuid"]',
			],
			expectedQueries: [
				// the Application itself remains, reconciled
				'//v2019C1:Application[@name="HMI"][@uuid="app-src-uuid"]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await updateAsd(tx, {
				sourceQuery: source.query,
				applicationRef,
				targetParent: targetBayRef,
				scenario: 'fork',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
