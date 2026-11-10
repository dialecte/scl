import { SCL_DIALECTE } from './declaration.constants'
import engineUrl from './test/scl-engine.worker?worker&url'

import { createDiagnostic, createProjectFactory } from '@dialecte/core'
import { registerSqliteEngine } from '@dialecte/core/sqlite'
import { describe, expect, it } from 'vitest'

import { SCL_IMPORT_DIAGNOSTICS } from '@/v2019C1/errors'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE } from '@/v2019C1/test'
import { ENGINE_LEG_TIMEOUT_MS } from '@/v2019C1/test/scl-test-setup.constants'

import type { ImportedDocument } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const L1 = '00000000-0000-4000-8000-000000000001'

/** A bay holding a terminal and the connectivity node `L1`. */
function substationWith(params: { terminal: string }): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="s1">
				<VoltageLevel name="VL1" ${id}="vl1">
					<Bay name="B1" ${id}="b1">
						<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
							${params.terminal}
						</ConductingEquipment>
						<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="${L1}" ${id}="l1"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

// the page tells once where its SQLite engine runs: the test suites' SCL worker
registerSqliteEngine({ url: engineUrl, dialectes: [SCL_DIALECTE] })

/** The SCL declaration's project factory: a project on SQLite storage runs in the engine registered above. */
const createSclEngineProject = createProjectFactory({ dialecte: SCL_DIALECTE })

/**
 * The file imported into a new SQLite project of the declaration, through its engine worker; the project destroyed
 * after, whatever happens.
 */
async function importThroughEngine(params: { name: string; xml: string }): Promise<{
	diagnostics: ImportedDocument['diagnostics']
	cNodeUuid: string | undefined
}> {
	const project = createSclEngineProject({ storage: { type: 'sqlite' } })
	try {
		await project.open(`scl-engine-leg-${crypto.randomUUID()}`)
		const imported = await project.importFile(
			new File([params.xml], params.name, { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const cNodeUuid = await project
			.openDocument(imported.documentId)
			.query.getAttribute({ tagName: 'Terminal', id: 'terminal' }, { name: 'cNodeUuid' })
		return { diagnostics: imported.diagnostics, cNodeUuid: cNodeUuid || undefined }
	} finally {
		await project.destroy()
	}
}

describe('the SCL declaration served by an engine worker: a file imported on SQLite storage', () => {
	type TestCase = {
		only?: boolean
		name: string
		xml: string
		expected: Awaited<ReturnType<typeof importThroughEngine>>
	}

	const testCases: Record<string, TestCase> = {
		'a coherent file → no diagnostic, the terminal’s uuid written by the import hooks': {
			name: 'clean.scd',
			xml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" ${id}="terminal"/>`,
			}),
			expected: { diagnostics: [], cNodeUuid: L1 },
		},
		'a terminal whose path names no node → its unresolved-reference diagnostic': {
			name: 'unresolved.scd',
			xml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L9" cNodeName="L9" ${id}="terminal"/>`,
			}),
			expected: {
				diagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', {
						ref: { tagName: 'Terminal', id: 'terminal', attribute: 'connectivityNode' },
						meta: {
							uuidAttribute: 'cNodeUuid',
							pathValue: 'S1/VL1/B1/L9',
							triedKeys: ['S1/VL1/B1/L9'],
						},
					}),
				],
				cNodeUuid: undefined,
			},
		},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(
			description,
			async () => {
				await expect(
					importThroughEngine({ name: testCase.name, xml: testCase.xml }),
				).resolves.toEqual(testCase.expected)
			},
			ENGINE_LEG_TIMEOUT_MS,
		)
	})
})
