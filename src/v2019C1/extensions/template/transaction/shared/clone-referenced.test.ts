import { cloneReferencedRecords, findMissingReferencedRecords } from './clone-referenced'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
		<Substation ${id}="target-sub" name="TEMPLATE" uuid="target-sub-uuid">
			<Private ${id}="target-priv" type="eIEC61850-6-100"/>
		</Substation>
	</SCL>
`

describe('findMissingReferencedRecords', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		scopeRef: Scl.Ref<'Application'>
		refTagName: 'AllocationRoleRef' | 'FunctionRef'
		targetTagName: 'AllocationRole' | 'Function'
		expectedCount: number
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'AllocationRoleRef with missing target → returns ref': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<Private ${id}="sub-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole ${id}="ar1" name="HMI_PC" uuid="ar1-uuid"/>
							<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app-uuid">
								<eIEC61850-6-100:AllocationRoleRef ${id}="arref1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			targetXml: emptyTargetXml,
			scopeRef: { tagName: 'Application', id: 'app1' } as Scl.Ref<'Application'>,
			refTagName: 'AllocationRoleRef',
			targetTagName: 'AllocationRole',
			expectedCount: 1,
		},
		'AllocationRoleRef with target already in target DB → returns empty': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<Private ${id}="sub-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole ${id}="ar1" name="HMI_PC" uuid="ar1-uuid"/>
							<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app-uuid">
								<eIEC61850-6-100:AllocationRoleRef ${id}="arref1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="target-sub" name="TEMPLATE" uuid="target-sub-uuid">
						<Private ${id}="target-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole ${id}="existing-ar" name="HMI_PC" uuid="ar1-uuid"/>
						</Private>
					</Substation>
				</SCL>
			`,
			scopeRef: { tagName: 'Application', id: 'app1' } as Scl.Ref<'Application'>,
			refTagName: 'AllocationRoleRef',
			targetTagName: 'AllocationRole',
			expectedCount: 0,
		},
		'Multiple refs with same uuid → deduplicated to single result': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<Private ${id}="sub-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole ${id}="ar1" name="HMI_PC" uuid="ar1-uuid"/>
							<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app-uuid">
								<eIEC61850-6-100:AllocationRoleRef ${id}="arref1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
								<eIEC61850-6-100:AllocationRoleRef ${id}="arref2" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			targetXml: emptyTargetXml,
			scopeRef: { tagName: 'Application', id: 'app1' } as Scl.Ref<'Application'>,
			refTagName: 'AllocationRoleRef',
			targetTagName: 'AllocationRole',
			expectedCount: 1,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, target, testCase }) => {
			const result = await target!.document.transaction(async (tx) => {
				return findMissingReferencedRecords(tx, {
					sourceQuery: source.document.query,
					scopeRef: testCase.scopeRef,
					refTagName: testCase.refTagName,
					targetTagName: testCase.targetTagName,
				})
			})
			expect(result).toHaveLength(testCase.expectedCount)
		},
	})
})

describe('cloneReferencedRecords', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
	}

	const act = async ({
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> => {
		await target!.document.transaction(async (tx) => {
			await cloneReferencedRecords(tx, {
				sourceQuery: source.document.query,
				scopeRef: { tagName: 'Application', id: 'app1' } as Scl.Ref<'Application'>,
				refTagName: 'AllocationRoleRef',
				targetTagName: 'AllocationRole',
				targetParent: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
			})
		})
		return { assertDatabaseName: target!.databaseName }
	}

	describe('AllocationRole satellite clone', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'AllocationRoleRef → AllocationRole cloned with new uuid': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:AllocationRole ${id}="ar1" name="HMI_PC" uuid="ar1-uuid">
									<eIEC61850-6-100:FunctionRef ${id}="ar-fref" function="TEMPLATE/Func" functionUuid="func-uuid"/>
								</eIEC61850-6-100:AllocationRole>
								<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app-uuid">
									<eIEC61850-6-100:AllocationRoleRef ${id}="arref1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
								</eIEC61850-6-100:Application>
							</Private>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				expectedQueries: [
					'//v2019C1:AllocationRole[@name="HMI_PC"][@uuid]',
					'//v2019C1:AllocationRole/v2019C1:FunctionRef[@functionUuid]',
				],
				unexpectedQueries: ['//v2019C1:AllocationRole[@uuid="ar1-uuid"]'],
			},
			'AllocationRole already in target → not duplicated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:AllocationRole ${id}="ar1" name="HMI_PC" uuid="ar1-uuid"/>
								<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app-uuid">
									<eIEC61850-6-100:AllocationRoleRef ${id}="arref1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
								</eIEC61850-6-100:Application>
							</Private>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="target-sub" name="TEMPLATE" uuid="target-sub-uuid">
							<Private ${id}="target-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:AllocationRole ${id}="existing-ar" name="HMI_PC" uuid="ar1-uuid"/>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					// Existing AllocationRole preserved
					'//v2019C1:AllocationRole[@name="HMI_PC"][@uuid="ar1-uuid"]',
				],
				unexpectedQueries: [
					// No second AllocationRole created
					'//v2019C1:AllocationRole[@uuid][2]',
				],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})
})
