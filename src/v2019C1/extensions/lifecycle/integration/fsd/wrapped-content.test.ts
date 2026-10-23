import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A tool's namespace, kept in a `Private` whose type is not the namespace's prefix. */
const TOOL = { uri: 'urn:example:tool', prefix: 'eTool', wrapperType: 'Tool-Layout' }

const functionRef = { tagName: 'Function', id: 'fn-src' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

/** A function whose logical node data carries labels, and what the function and the labels hold besides. */
function functionHolding(params: {
	uuidOf: (name: string) => string
	lineage: boolean
	inFunction: string
	inLabels: string
	idPrefix: string
}): string {
	const { uuidOf, lineage, inFunction, inLabels, idPrefix } = params
	const identity = (name: string) =>
		lineage ? `uuid="${name}-inst" templateUuid="${uuidOf(name)}"` : `uuid="${uuidOf(name)}"`
	return /* xml */ `
		<Function name="Breaker" ${identity('fn')} ${id}="${idPrefix === 's' ? 'fn-src' : 'fn-inst'}">
			${inFunction}
			<LNode iedName="None" lnClass="XCBR" lnInst="1" ${identity('ln')} ${id}="${idPrefix}-ln">
				<Private type="eIEC61850-6-100" ${id}="${idPrefix}-ln-private">
					<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${id}="${idPrefix}-spec"/>
					<eIEC61850-6-100:DOS name="Pos" ${id}="${idPrefix}-dos">
						<eIEC61850-6-100:DAS name="stVal" ${id}="${idPrefix}-das">
							<eIEC61850-6-100:Labels ${id}="${idPrefix}-labels">
								<Label lang="en" ${id}="${idPrefix}-label">Position</Label>
								${inLabels}
							</eIEC61850-6-100:Labels>
						</eIEC61850-6-100:DAS>
					</eIEC61850-6-100:DOS>
				</Private>
			</LNode>
		</Function>
	`
}

const uuidOf = (name: string) => `${name}-src-uuid`

function sourceXml(params: { inFunction: string; inLabels: string }): string {
	return /* xml */ `
		<SCL ${ns} xmlns:${TOOL.prefix}="${TOOL.uri}" ${id}="fsd">
			<Header id="breaker" uuid="fsd-file" version="1" revision="B" ${id}="fsd-header"/>
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="TEMPLATE" ${id}="bay-s">
						${functionHolding({ uuidOf, lineage: false, idPrefix: 's', ...params })}
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

function targetXml(params: { inFunction: string; inLabels: string }): string {
	return /* xml */ `
		<SCL ${ns} xmlns:${TOOL.prefix}="${TOOL.uri}" ${id}="project">
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t">
					<Bay name="B1" ${id}="bay-t">
						${functionHolding({ uuidOf, lineage: true, idPrefix: 't', ...params })}
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

const toolLabel = (name: string) =>
	/* xml */ `<${TOOL.prefix}:Info name="${name}" ${id}="info-${name}"/>`
const toolWrapper = (content: string, wrapperId: string) =>
	/* xml */ `<Private type="${TOOL.wrapperType}" ${id}="${wrapperId}">${content}</Private>`

async function update(params: {
	source: { inFunction: string; inLabels: string }
	target: { inFunction: string; inLabels: string }
}): Promise<{ xml: string; groups: string[] }> {
	const { source, target } = await createSclTestProject({
		sourceXml: sourceXml(params.source),
		targetXml: targetXml(params.target),
	})
	if (!target) throw new Error('target required')
	const { report } = await reportAndApply({
		document: target.document,
		lifecycle: {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		},
	})
	const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
	return { xml, groups: listGroups(report) }
}

/** The tags of a wrapper of the tool's type holding `name`, under the element a selector names, and the count of wrappers there. */
function wrappedIn(params: { xml: string; parentLocalName: string; name: string }): {
	wrapperTypes: string[]
	wrappersOfToolType: number
	directChildren: number
} {
	const { xml, parentLocalName, name } = params
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	const [parent] = [...document.getElementsByTagName('*')].filter(
		(element) => element.localName === parentLocalName,
	)
	const children = [...parent.children]
	const holding = children.filter((child) =>
		[...child.children].some(
			(grandChild) => grandChild.localName === 'Info' && grandChild.getAttribute('name') === name,
		),
	)
	return {
		wrapperTypes: holding.map((wrapper) => `${wrapper.localName} ${wrapper.getAttribute('type')}`),
		wrappersOfToolType: children.filter(
			(child) => child.localName === 'Private' && child.getAttribute('type') === TOOL.wrapperType,
		).length,
		directChildren: children.filter((child) => child.localName === 'Info').length,
	}
}

describe('update: what the template holds in a wrapper lands in the instance wrapper of its type', () => {
	it('a labels element gains a tool element in a wrapper the instance lacks: the wrapper is made, of the same type', async () => {
		const { xml, groups } = await update({
			source: { inFunction: '', inLabels: toolWrapper(toolLabel('a'), 's-tool') },
			target: { inFunction: '', inLabels: '' },
		})
		expect(groups, 'the element the template gained').toEqual(['added Info'])
		expect(wrappedIn({ xml, parentLocalName: 'Labels', name: 'a' })).toEqual({
			wrapperTypes: [`Private ${TOOL.wrapperType}`],
			wrappersOfToolType: 1,
			directChildren: 0,
		})
	})

	it('a labels element gains a tool element in a wrapper the instance holds: that wrapper takes it', async () => {
		const { xml } = await update({
			source: {
				inFunction: '',
				inLabels: toolWrapper(`${toolLabel('a')}${toolLabel('b')}`, 's-tool'),
			},
			target: { inFunction: '', inLabels: toolWrapper(toolLabel('a'), 't-tool') },
		})
		expect(wrappedIn({ xml, parentLocalName: 'Labels', name: 'b' })).toEqual({
			wrapperTypes: [`Private ${TOOL.wrapperType}`],
			wrappersOfToolType: 1,
			directChildren: 0,
		})
	})

	it("a labels element gains a tool element, the instance holding another tool's wrapper only: a wrapper of its type is made", async () => {
		const { xml } = await update({
			source: { inFunction: '', inLabels: toolWrapper(toolLabel('a'), 's-tool') },
			target: {
				inFunction: '',
				inLabels: `<Private type="Other-Tool" ${id}="t-other-tool">other data</Private>`,
			},
		})
		expect(wrappedIn({ xml, parentLocalName: 'Labels', name: 'a' })).toEqual({
			wrapperTypes: [`Private ${TOOL.wrapperType}`],
			wrappersOfToolType: 1,
			directChildren: 0,
		})
		expect(xml).toContain('other data')
	})

	it('a labels element gains two tool elements in a wrapper the instance lacks: one wrapper is made for both', async () => {
		const { xml } = await update({
			source: {
				inFunction: '',
				inLabels: toolWrapper(`${toolLabel('a')}${toolLabel('b')}`, 's-tool'),
			},
			target: { inFunction: '', inLabels: '' },
		})
		for (const name of ['a', 'b'])
			expect(wrappedIn({ xml, parentLocalName: 'Labels', name }), name).toEqual({
				wrapperTypes: [`Private ${TOOL.wrapperType}`],
				wrappersOfToolType: 1,
				directChildren: 0,
			})
	})

	it('a function gains a tool element in a wrapper: the wrapper is made under the function, of the same type', async () => {
		const { xml } = await update({
			source: { inFunction: toolWrapper(toolLabel('c'), 's-tool'), inLabels: '' },
			target: { inFunction: '', inLabels: '' },
		})
		expect(wrappedIn({ xml, parentLocalName: 'Function', name: 'c' })).toEqual({
			wrapperTypes: [`Private ${TOOL.wrapperType}`],
			wrappersOfToolType: 1,
			directChildren: 0,
		})
	})
})
