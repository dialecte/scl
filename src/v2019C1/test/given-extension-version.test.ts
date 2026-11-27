import { lacksExtensionVersion } from './given-extension-version'
import { createSclTestProject } from './hydrated-test'
import { openSclDocument } from './open-scl-document'
import { assertOutputGateTestCases, withOutputGate } from './output-gate'
import {
	ALL_XMLNS_NAMESPACES,
	CURRENT_SCL_EDITION,
	XMLNS_SCL_6_100_NAMESPACE,
	XMLNS_SCL_NAMESPACE,
} from './scl-xmlns.constants'

import { describe, expect, it } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'

import type { OutputGateTestCase } from './output-gate.types'

/** A root declaring the eIEC61850-6-100 namespace and stating the SCL edition, but not the extension's version. */
const WITHOUT_EXTENSION_VERSION = /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${CURRENT_SCL_EDITION}><Header id="h"/></SCL>`
/** The eIEC61850-6-100 namespace declared below the root only, the root stating no extension version. */
const DECLARED_BELOW_THE_ROOT = /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${CURRENT_SCL_EDITION}><Header id="h"/><Substation name="S1"><VoltageLevel name="E1"><Bay name="Q01"><LNode iedName="None" lnClass="PTRC" lnInst="1"><Private type="eIEC61850-6-100"><eIEC61850-6-100:LNodeSpecNaming ${XMLNS_SCL_6_100_NAMESPACE} sLnClass="PTRC" sLnInst="1"/></Private></LNode></Bay></VoltageLevel></Substation></SCL>`
/** A root stating the SCL edition, neither declaring nor using the eIEC61850-6-100 namespace. */
const WITHOUT_EXTENSION = /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} ${CURRENT_SCL_EDITION}><Header id="h"/></SCL>`

const OPT_OUT = 'a root left without the extension version on purpose'

type ExtensionVersionCase = {
	sourceXml: string
	targetXml?: string
	noExtensionVersion?: string
	/** The message the call rejects with, absent when the project opens. */
	expected: ReturnType<typeof expect.stringContaining> | undefined
}

// A given document carrying the eIEC61850-6-100 namespace states the extension's version on its root, as every fixture
// root built with ALL_XMLNS_NAMESPACES does: one that does not is refused unless the case says why
// (`noExtensionVersion`, with the reason). An opt-out on documents stating it, or without a reason, is refused too.
describe('createSclTestProject - the eIEC61850-6-100 version a given document states', () => {
	const testCases: Record<string, ExtensionVersionCase> = {
		'a root built with ALL_XMLNS_NAMESPACES → opens': {
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="h"/></SCL>`,
			expected: undefined,
		},
		'a root declaring 6-100 without its version → refused, naming the source document': {
			sourceXml: WITHOUT_EXTENSION_VERSION,
			expected: expect.stringContaining(
				'the source document carries the eIEC61850-6-100 namespace but its root states not its version',
			),
		},
		'6-100 declared below the root only → refused, naming the source document': {
			sourceXml: DECLARED_BELOW_THE_ROOT,
			expected: expect.stringContaining(
				'the source document carries the eIEC61850-6-100 namespace but its root states not its version',
			),
		},
		'a root declaring 6-100 in single quotes without its version → refused, naming the source document':
			{
				sourceXml: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} xmlns:eIEC61850-6-100='http://www.iec.ch/61850/2019/SCL/6-100' ${CURRENT_SCL_EDITION}><Header id="h"/></SCL>`,
				expected: expect.stringContaining(
					'the source document carries the eIEC61850-6-100 namespace but its root states not its version',
				),
			},
		'a root binding 6-100 to another prefix, stating no version under it → refused, naming the source document':
			{
				sourceXml: /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE} xmlns:e6100="http://www.iec.ch/61850/2019/SCL/6-100" ${CURRENT_SCL_EDITION}><Header id="h"/></SCL>`,
				expected: expect.stringContaining(
					'the source document carries the eIEC61850-6-100 namespace but its root states not its version',
				),
			},
		'a target declaring 6-100 without its version → refused, naming the target document': {
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="h"/></SCL>`,
			targetXml: WITHOUT_EXTENSION_VERSION,
			expected: expect.stringContaining(
				'the target document carries the eIEC61850-6-100 namespace but its root states not its version',
			),
		},
		'a root neither declaring nor using 6-100 → opens': {
			sourceXml: WITHOUT_EXTENSION,
			expected: undefined,
		},
		'a root declaring 6-100 without its version, noExtensionVersion given → opens': {
			sourceXml: WITHOUT_EXTENSION_VERSION,
			noExtensionVersion: OPT_OUT,
			expected: undefined,
		},
		'every root stating its version, noExtensionVersion given → refused, the opt-out stale': {
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="h"/></SCL>`,
			noExtensionVersion: OPT_OUT,
			expected: expect.stringContaining(
				'noExtensionVersion is given but no given document lacks the eIEC61850-6-100 version: remove it',
			),
		},
		'a root declaring 6-100 without its version, noExtensionVersion empty → refused, no reason': {
			sourceXml: WITHOUT_EXTENSION_VERSION,
			noExtensionVersion: '',
			expected: expect.stringContaining('noExtensionVersion needs the reason'),
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, async () => {
			const opened = createSclTestProject({
				sourceXml: testCase.sourceXml,
				targetXml: testCase.targetXml,
				noExtensionVersion: testCase.noExtensionVersion,
			}).then(
				() => undefined,
				(error: unknown) => (error instanceof Error ? error.message : String(error)),
			)
			const message = await opened
			expect(message).toEqual(testCase.expected)
		})
	}

	it('a root built with ALL_XMLNS_NAMESPACES → stored stating eIEC61850-6-100 version 2019 revision C release 1', async () => {
		const { source } = await createSclTestProject({
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="h"/></SCL>`,
		})
		const root = await source.document.query.getRoot()
		const stated = ['version', 'revision', 'release'].map((name) =>
			readAttribute({ record: root, name: `eIEC61850-6-100:${name}`, defaults: 'none' }),
		)
		expect(stated).toEqual(['2019', 'C', '1'])
	})
})

// Every path a case document takes is held to the extension's version: the runner's gate before each act, a third
// document opened with `openSclDocument`, and the runner's check of the cases before the suite.
describe('the eIEC61850-6-100 version of a given document, on every path a test reads it', () => {
	it('the runner gate: a case whose source lacks the extension version, no opt-out → its act refused', async () => {
		const { project, source } = await createSclTestProject({
			sourceXml: WITHOUT_EXTENSION_VERSION,
			noExtensionVersion: OPT_OUT,
		})
		const gatedCase: OutputGateTestCase = { sourceXml: WITHOUT_EXTENSION_VERSION }
		const gatedAct = withOutputGate({
			act: async function noAct() {},
			testCases: { 'gated case': gatedCase },
		})
		const outcome = gatedAct({ testCase: gatedCase, project, source: source.document })
		await expect(outcome).rejects.toThrow(
			'gated case: the source document carries the eIEC61850-6-100 namespace',
		)
	})

	it('the runner gate: the same case with noExtensionVersion → its act runs', async () => {
		const { project, source } = await createSclTestProject({
			sourceXml: WITHOUT_EXTENSION_VERSION,
			noExtensionVersion: OPT_OUT,
		})
		const gatedCase: OutputGateTestCase = {
			sourceXml: WITHOUT_EXTENSION_VERSION,
			noExtensionVersion: OPT_OUT,
		}
		const gatedAct = withOutputGate({
			act: async function noAct() {},
			testCases: { 'gated case': gatedCase },
		})
		const outcome = gatedAct({ testCase: gatedCase, project, source: source.document })
		await expect(outcome).resolves.toBeUndefined()
	})

	it('openSclDocument: a third document lacking the extension version, no opt-out → refused', async () => {
		const { project } = await createSclTestProject({ sourceXml: WITHOUT_EXTENSION })
		const opened = openSclDocument({ project, xml: WITHOUT_EXTENSION_VERSION, label: 'third' })
		await expect(opened).rejects.toThrow(
			'third: the source document carries the eIEC61850-6-100 namespace',
		)
	})

	it('the cases checked before the suite: noExtensionVersion empty → refused, naming the case', () => {
		function refused(): void {
			assertOutputGateTestCases({
				testCases: {
					'empty opt-out': { sourceXml: WITHOUT_EXTENSION_VERSION, noExtensionVersion: '' },
				},
			})
		}
		expect(refused).toThrow('empty opt-out: noExtensionVersion needs the reason')
	})
})

const EXTENSION_URI = 'http://www.iec.ch/61850/2019/SCL/6-100'
const SCL_URI = 'http://www.iec.ch/61850/2003/SCL'

// The root is read as XML, not as text: the verdict follows the root element, whatever comes before it or however its
// start tag is written.
describe('lacksExtensionVersion - a root written in any well-formed way', () => {
	const testCases: Record<string, { xml: string; expected: boolean }> = {
		'the extension version before the namespace declaration → lacks nothing': {
			xml: `<SCL eIEC61850-6-100:version="2019" eIEC61850-6-100:revision="C" eIEC61850-6-100:release="1" xmlns:eIEC61850-6-100="${EXTENSION_URI}" xmlns="${SCL_URI}" version="2007"/>`,
			expected: false,
		},
		'the declaration and the version in single quotes → lacks nothing': {
			xml: `<SCL xmlns='${SCL_URI}' xmlns:eIEC61850-6-100='${EXTENSION_URI}' eIEC61850-6-100:version='2019' version='2007'/>`,
			expected: false,
		},
		'a comment before the root holding an SCL start tag without the version → the root read, lacks nothing':
			{
				xml: `<?xml version="1.0"?><!-- <SCL xmlns:eIEC61850-6-100="${EXTENSION_URI}"> --><SCL xmlns="${SCL_URI}" xmlns:eIEC61850-6-100="${EXTENSION_URI}" eIEC61850-6-100:version="2019" version="2007"/>`,
				expected: false,
			},
		'a > inside an attribute value before the version → lacks nothing': {
			xml: `<SCL xmlns="${SCL_URI}" xmlns:eIEC61850-6-100="${EXTENSION_URI}" xmlns:dev="urn:a>b" eIEC61850-6-100:version="2019" version="2007"/>`,
			expected: false,
		},
		'a prefixed root declaring the extension without its version → lacks it': {
			xml: `<scl:SCL xmlns:scl="${SCL_URI}" xmlns:eIEC61850-6-100="${EXTENSION_URI}" version="2007"/>`,
			expected: true,
		},
	}
	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(lacksExtensionVersion({ xml: testCase.xml })).toBe(testCase.expected)
		})
	}
})
