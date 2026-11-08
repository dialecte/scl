import packageJson from '../../package.json'
import { SCL_DIALECTE } from './declaration.constants'
import { createSclProject } from './dialecte'

import { createDiagnostic } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { SCL_IMPORT_DIAGNOSTICS } from '@/v2019C1/errors'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A terminal whose path names no node: the import hooks report it. */
const UNRESOLVED_FILE = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="VL1" ${id}="vl1">
				<Bay name="B1" ${id}="b1">
					<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
						<Terminal connectivityNode="S1/VL1/B1/L9" cNodeName="L9" ${id}="terminal"/>
					</ConductingEquipment>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A consumer's own query module, passed to the factory. */
const PROBE_MODULES = {
	probe: {
		query: {
			answer: async function answer() {
				return 42
			},
		},
	},
}

/**
 * What a project of `createSclProject` is made of, read by using it. The version has no public read (only the SQLite
 * engine handshake uses it), so its private field is read. `query.history` is SCL's own module: without the dialecte's
 * extensions the call throws, and a document with no history answers an empty list.
 */
async function readProject() {
	const project = createSclProject({
		storage: { type: 'inMemory' },
		extensions: PROBE_MODULES,
	})
	try {
		await project.open(`scl-factory-${crypto.randomUUID()}`)
		const imported = await project.importFile(
			new File([UNRESOLVED_FILE], 'unresolved.scd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const document = project.openDocument(imported.documentId)
		const created = await document.transaction(async function addNode(tx) {
			return tx.addChild(
				{ tagName: 'Bay', id: 'b1' },
				{ tagName: 'ConnectivityNode', attributes: { name: 'L2', pathName: '' } },
			)
		})
		return {
			dialecteId: project.dialecteId,
			dialecteVersion: project['dialecteVersion'],
			diagnostics: imported.diagnostics,
			hitems: await document.query.history.getSortedHitems(),
			pathWrittenByRecordHook: await document.query.getAttribute(
				{ tagName: created.tagName, id: created.id },
				{ name: 'pathName' },
			),
			customAnswer: await document.query.probe.answer(),
		}
	} finally {
		await project.destroy()
	}
}

describe('createSclProject', () => {
	it('makes a project of the declaration: its id, its version, its import and record hooks, its extensions and the consumer’s', async () => {
		await expect(readProject()).resolves.toEqual({
			dialecteId: 'scl/v2019C1',
			dialecteVersion: packageJson.version,
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
			hitems: [],
			pathWrittenByRecordHook: 'S1/VL1/B1/L2',
			customAnswer: 42,
		})
	})
})

/**
 * How many documents an SCL project of that name holds on in-memory storage, read by opening it: the realm keeps a
 * closed project's in-memory state, by dialecte and name, until it is destroyed.
 */
async function countInMemoryDocuments(name: string): Promise<number> {
	const project = createSclProject({ storage: { type: 'inMemory' } })
	await project.open(name)
	try {
		return (await project.getDocuments()).length
	} finally {
		await project.close()
	}
}

/**
 * The documents of an in-memory SCL project of a fresh name, before and after `createSclProject.destroyProject` named
 * it: the project holds one document, closed before the destroy.
 */
async function readDestroyProject(): Promise<{ before: number; after: number }> {
	const name = `scl-factory-destroy-${crypto.randomUUID()}`
	const project = createSclProject({ storage: { type: 'inMemory' } })
	await project.open(name)
	await project.initEmptyDocument()
	await project.close()
	const before = await countInMemoryDocuments(name)
	await createSclProject.destroyProject({ name, storage: { type: 'inMemory' } })
	const after = await countInMemoryDocuments(name)
	await createSclProject.destroyProject({ name, storage: { type: 'inMemory' } })
	return { before, after }
}

describe('createSclProject, the factory of the declaration', () => {
	it('carries the SCL declaration it makes its projects from', () => {
		expect(createSclProject.dialecte).toBe(SCL_DIALECTE)
	})

	it('destroyProject deletes the SCL project of that name on the storage named, without opening it', async () => {
		await expect(readDestroyProject()).resolves.toEqual({ before: 1, after: 0 })
	})
})
