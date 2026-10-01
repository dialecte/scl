import { applyUuidRemap } from './apply-uuid-remap'

import { describe } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * Isolated unit test of the primitive — no clone, no hook. The fixture is a
 * hand-built "post-clone, pre-remap" state: a Function carries a fresh uuid while
 * a FunctionRef still points at the SOURCE uuid. `applyUuidRemap` must repoint the
 * ref onto the fresh uuid using the supplied mappings.
 */

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	cloneMappings: Scl.CloneMapping[]
	/** Source elements mapped onto an element the document already holds (nothing cloned for them). */
	redirectMappings?: RedirectMapping[]
}

describe('applyUuidRemap', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'repoints a ref from the source uuid to the clone uuid': {
			allowIncoherentReferences:
				'a freshly cloned reference still carries the uuid of the document it was cloned from',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="Sub1" ${id}="sub-1">
						<Function name="F1" ${id}="fn-clone" uuid="new-uuid">
							<Private type="eIEC61850-6-100" ${id}="priv-c">
								<eIEC61850-6-100:FunctionRef ${id}="fref-clone" function="stale/path" functionUuid="src-uuid"/>
							</Private>
						</Function>
					</Substation>
				</SCL>
			`,
			cloneMappings: [
				{
					source: {
						tagName: 'Function',
						id: 'fn-src',
						attributes: [{ name: 'uuid', value: 'src-uuid' }],
					},
					target: { tagName: 'Function', id: 'fn-clone' },
				},
				{
					source: {
						tagName: 'FunctionRef',
						id: 'fref-src',
						attributes: [{ name: 'uuid', value: 'src-ref-uuid' }],
					},
					target: { tagName: 'FunctionRef', id: 'fref-clone' },
				},
			] as unknown as Scl.CloneMapping[],
			expectedQueries: ['//v2019C1:FunctionRef[@functionUuid="new-uuid"]'],
			unexpectedQueries: ['//v2019C1:FunctionRef[@functionUuid="src-uuid"]'],
		},
		'a cloned ref to an element mapped onto an existing one → repointed to that element, uuid and path':
			{
				allowIncoherentReferences:
					'the cloned reference still carries the uuid of the document it was cloned from',
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="Sub1" ${id}="sub-1">
						<Private type="eIEC61850-6-100" ${id}="priv-1">
							<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="project-role-uuid" ${id}="role-project"/>
							<eIEC61850-6-100:Application name="App" uuid="app-clone-uuid" ${id}="app-clone">
								<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="template-role-uuid" ${id}="role-ref-clone"/>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
				cloneMappings: [
					{
						source: {
							tagName: 'AllocationRoleRef',
							id: 'role-ref-template',
							attributes: [],
						},
						target: { tagName: 'AllocationRoleRef', id: 'role-ref-clone' },
					},
				] as unknown as Scl.CloneMapping[],
				redirectMappings: [
					{
						sourceUuid: 'template-role-uuid',
						target: { tagName: 'AllocationRole', id: 'role-project' },
					},
				],
				expectedQueries: [
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid="project-role-uuid"][@allocationRole="Sub1/HMI_PC"]',
				],
				unexpectedQueries: [
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid="template-role-uuid"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await applyUuidRemap(tx, {
				cloneMappings: testCase.cloneMappings,
				redirectMappings: testCase.redirectMappings,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
