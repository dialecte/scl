import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const emptyTarget = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="root">
		<Substation ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub1" name="Sub1" />
	</SCL>`

describe('afterDeepClone', () => {
	// ── Cross-DB: clone from source to fresh target ─────────────────────────

	describe('cross-DB deepClone', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			targetXml: string
			act: (source: Scl.Document, target: Scl.Document) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'clone Function → exists in target with name preserved': {
				sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="root">
					<Substation ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub1" name="Sub1">
						<Function ${CUSTOM_RECORD_ID_ATTRIBUTE}="f1" name="F1" uuid="uuid-f1" />
					</Substation>
				</SCL>`,
				targetXml: emptyTarget,
				act: async (source, target) => {
					const tree = await source.query.getTree({ tagName: 'Function', id: 'f1' })
					await target.transaction(async (tx) => {
						if (tree) await tx.deepClone({ tagName: 'Substation' as const, id: 'sub1' }, tree)
					})
				},
				expectedQueries: ['//default:Substation/default:Function[@name="F1"]'],
			},

			'clone Function with external FunctionRef → FunctionRef uuid preserved in target': {
				sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="root">
					<Substation ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub1" name="Sub1">
						<Function ${CUSTOM_RECORD_ID_ATTRIBUTE}="f1" name="F1" uuid="uuid-f1" />
						<Function ${CUSTOM_RECORD_ID_ATTRIBUTE}="f2" name="F2" uuid="uuid-f2">
						<eIEC61850-6-100:FunctionRef ${CUSTOM_RECORD_ID_ATTRIBUTE}="fref1" function="Sub1/F1" functionUuid="uuid-f1" />
						</Function>
					</Substation>
				</SCL>`,
				targetXml: emptyTarget,
				act: async (source, target) => {
					const tree = await source.query.getTree({ tagName: 'Function', id: 'f2' })
					await target.transaction(async (tx) => {
						if (tree) await tx.deepClone({ tagName: 'Substation' as const, id: 'sub1' }, tree)
					})
				},
				expectedQueries: [
					'//default:Function[@name="F2"]',
					'//v2019C1:FunctionRef[@functionUuid="uuid-f1"]',
				],
			},

			// A bound LNode (lnUuid + stamped identity) whose implementing LN is NOT part
			// of the cloned subtree keeps its binding verbatim: afterDeepClone remaps the
			// uuids of cloned elements and rebuilds ref paths, but does NOT re-run the
			// LNode-binding reconciler. Re-homing a binding to a different IED is owned by
			// the instantiate lifecycle, not by the clone hook — this pins that boundary.
			'clone Function with a bound LNode → identity + lnUuid preserved verbatim': {
				sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="root">
					<Substation ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub1" name="Sub1">
						<Function ${CUSTOM_RECORD_ID_ATTRIBUTE}="f1" name="F1" uuid="uuid-f1">
							<LNode ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode1" iedName="PIU" ldInst="CTRL" lnClass="CSWI" lnInst="2" prefix="CB" lnUuid="ln-uuid" templateUuid="lnode-tpl" uuid="uuid-lnode1" />
						</Function>
					</Substation>
				</SCL>`,
				targetXml: emptyTarget,
				act: async (source, target) => {
					const tree = await source.query.getTree({ tagName: 'Function', id: 'f1' })
					await target.transaction(async (tx) => {
						if (tree) await tx.deepClone({ tagName: 'Substation' as const, id: 'sub1' }, tree)
					})
				},
				expectedQueries: [
					'//default:LNode[@iedName="PIU"][@ldInst="CTRL"][@lnClass="CSWI"][@lnInst="2"][@prefix="CB"][@lnUuid="ln-uuid"][@templateUuid="lnode-tpl"]',
				],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act: async ({ source, target, testCase }) => {
				if (!target) throw new Error('target required')
				await testCase.act(source, target)
				return { assertOn: 'target' }
			},
		})
	})

	// ── Same-DB: uuid remapping and path update ──────────────────────────────

	describe('same-DB deepClone', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'clone Function with FunctionCatRef → functionUuid remapped to new Function uuid': {
				sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="root">
					<Substation ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub1" name="Sub1">
						<FunctionCategory ${CUSTOM_RECORD_ID_ATTRIBUTE}="fcat1" name="Cat1">
							<FunctionCatRef ${CUSTOM_RECORD_ID_ATTRIBUTE}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
						</FunctionCategory>
						<Function ${CUSTOM_RECORD_ID_ATTRIBUTE}="f1" name="F1" uuid="uuid-f1" />
					</Substation>
				</SCL>`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						const fcatTree = await tx.getTree({ tagName: 'FunctionCategory', id: 'fcat1' })
						const fnTree = await tx.getTree({ tagName: 'Function', id: 'f1' })
						const sub = { tagName: 'Substation' as const, id: 'sub1' }
						if (fcatTree) await tx.deepClone(sub, fcatTree)
						if (fnTree) await tx.deepClone(sub, fnTree)
					})
				},
				expectedQueries: ['//default:Function[@name="F1"][2]'],
				unexpectedQueries: ['//default:FunctionCatRef[@functionUuid="uuid-f1"][2]'],
			},

			'clone self-referencing Function → FunctionRef.functionUuid remapped to clone': {
				sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="root">
					<Substation ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub1" name="Sub1">
						<Function ${CUSTOM_RECORD_ID_ATTRIBUTE}="f1" name="F1" uuid="uuid-f1">
						<eIEC61850-6-100:FunctionRef ${CUSTOM_RECORD_ID_ATTRIBUTE}="fref1" function="Sub1/F1" functionUuid="uuid-f1" />
						</Function>
						</Substation>
				</SCL>`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						const fnTree = await tx.getTree({ tagName: 'Function', id: 'f1' })
						if (fnTree) await tx.deepClone({ tagName: 'Substation' as const, id: 'sub1' }, fnTree)
					})
				},
				expectedQueries: ['//default:Function[@name="F1"][2]', '//v2019C1:FunctionRef'],
				unexpectedQueries: [
					'//default:Function[@name="F1"][2]//v2019C1:FunctionRef[@functionUuid="uuid-f1"]',
				],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act: async ({ source, testCase }) => {
				await testCase.act(source)
				return { assertOn: 'source' }
			},
		})
	})
})
