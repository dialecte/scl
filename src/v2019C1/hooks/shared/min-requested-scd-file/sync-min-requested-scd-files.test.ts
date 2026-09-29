import { syncMinRequestedScdFiles } from './sync-min-requested-scd-files'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const projectUuid = '11111111-2222-3333-4444-555555555555'
const otherProjectUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const header = `<Header ${id}="header" id="Project" uuid="${projectUuid}" version="2" revision="B" />`
const accessPoint = `<AccessPoint ${id}="protection-access-point" name="AP1" />`

describe('syncMinRequestedScdFiles', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		iedIds: string[]
		expected: {
			operations: string[]
			projectEntry?: Record<string, string>
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'no wrapper → wrapper and entry created from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					${header}
					<IED ${id}="protection" name="Protection">
						${accessPoint}
						<!-- no MinRequestedSCDFiles -->
					</IED>
				</SCL>
			`,
			iedIds: ['protection'],
			expected: {
				operations: ['created MinRequestedSCDFiles', 'created MinRequestedSCDFile', 'updated IED'],
				projectEntry: { fileType: 'SCD', fileUuid: projectUuid, version: '2', revision: 'B' },
			},
		},
		'only another project listed → entry appended, other project untouched': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					${header}
					<IED ${id}="protection" name="Protection">
						${accessPoint}
						<MinRequestedSCDFiles ${id}="wrapper">
							<MinRequestedSCDFile ${id}="other-project-entry" fileType="SCD" fileUuid="${otherProjectUuid}" version="9" revision="Z" />
							<!-- no entry for the current project -->
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			iedIds: ['protection'],
			expected: {
				operations: ['created MinRequestedSCDFile', 'updated MinRequestedSCDFiles'],
				projectEntry: { fileType: 'SCD', fileUuid: projectUuid, version: '2', revision: 'B' },
			},
		},
		'project entry outdated → managed attributes updated, hand-set ones kept': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					${header}
					<IED ${id}="protection" name="Protection">
						${accessPoint}
						<MinRequestedSCDFiles ${id}="wrapper">
							<MinRequestedSCDFile ${id}="outdated-entry" fileType="SCD" fileUuid="${projectUuid}" version="1" revision="A" fileName="hand.scd" />
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			iedIds: ['protection'],
			expected: {
				operations: ['updated MinRequestedSCDFile'],
				projectEntry: {
					fileType: 'SCD',
					fileUuid: projectUuid,
					version: '2',
					revision: 'B',
					fileName: 'hand.scd',
				},
			},
		},
		'project entry up to date → no operation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					${header}
					<IED ${id}="protection" name="Protection">
						${accessPoint}
						<MinRequestedSCDFiles ${id}="wrapper">
							<MinRequestedSCDFile ${id}="current-entry" fileType="SCD" fileUuid="${projectUuid}" version="2" revision="B" />
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			iedIds: ['protection'],
			expected: { operations: [] },
		},
		'project listed twice → folded into the first, hand-set attributes carried over': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					${header}
					<IED ${id}="protection" name="Protection">
						${accessPoint}
						<MinRequestedSCDFiles ${id}="wrapper">
							<MinRequestedSCDFile ${id}="first-entry" fileType="SCD" fileUuid="${projectUuid}" version="2" revision="B" />
							<MinRequestedSCDFile ${id}="duplicate-entry" fileType="SCD" fileUuid="${projectUuid}" version="1" revision="A" when="yesterday" />
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			iedIds: ['protection'],
			expected: {
				operations: [
					'updated MinRequestedSCDFile',
					'deleted MinRequestedSCDFile',
					'updated MinRequestedSCDFiles',
				],
				projectEntry: {
					fileType: 'SCD',
					fileUuid: projectUuid,
					version: '2',
					revision: 'B',
					when: 'yesterday',
				},
			},
		},
		'Header without version and revision → empty values': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header ${id}="header" id="Project" uuid="${projectUuid}" />
					<IED ${id}="protection" name="Protection">
						${accessPoint}
					</IED>
				</SCL>
			`,
			iedIds: ['protection'],
			expected: {
				operations: ['created MinRequestedSCDFiles', 'created MinRequestedSCDFile', 'updated IED'],
				projectEntry: { fileType: 'SCD', fileUuid: projectUuid, version: '', revision: '' },
			},
		},
		'no Header → no operation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<!-- no Header -->
					<IED ${id}="protection" name="Protection">
						${accessPoint}
					</IED>
				</SCL>
			`,
			iedIds: ['protection'],
			expected: { operations: [] },
		},
		'same IED requested twice → synced once': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					${header}
					<IED ${id}="protection" name="Protection">
						${accessPoint}
					</IED>
				</SCL>
			`,
			iedIds: ['protection', 'protection'],
			expected: {
				operations: ['created MinRequestedSCDFiles', 'created MinRequestedSCDFile', 'updated IED'],
				projectEntry: { fileType: 'SCD', fileUuid: projectUuid, version: '2', revision: 'B' },
			},
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const iedRefs = testCase.iedIds.map((iedId) => ({ tagName: 'IED' as const, id: iedId }))

			const operations = await syncMinRequestedScdFiles(source.query, { iedRefs })

			expect(operations.map(describeOperation)).toEqual(testCase.expected.operations)
			expect(findProjectEntryAttributes(operations)).toEqual(testCase.expected.projectEntry)
		},
	})
})

function describeOperation(operation: Scl.Operation): string {
	const record = operation.status === 'deleted' ? operation.oldRecord : operation.newRecord
	return `${operation.status} ${record.tagName}`
}

function findProjectEntryAttributes(
	operations: Scl.Operation[],
): Record<string, string> | undefined {
	const entryOperation = operations.find(
		(operation) =>
			operation.status !== 'deleted' && operation.newRecord.tagName === 'MinRequestedSCDFile',
	)
	if (!entryOperation?.newRecord) return undefined

	return Object.fromEntries(
		entryOperation.newRecord.attributes.map((attribute) => [attribute.name, attribute.value]),
	)
}
