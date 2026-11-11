/**
 * SCL fixture for the `info.ofEach` benchmark: the shape that makes titles and states expensive.
 * At `scale` 1 it mirrors a real system file of about 15,000 elements under the Substation:
 *
 * - 240 LNodes, each under its own SubFunction, each mapped by `lnUuid` to an LN of an IED
 *   (12 IEDs, 20 LNs each), so every LNode state resolves its LN and climbs to its IED;
 * - 7 of them carry `LNodeInputs` with 120 `SourceRef` signals each (840 signals), so each signal
 *   name is computed among about 120 siblings;
 * - every LNode carries DOS / DAS / Labels filler, the bulk of the elements to title.
 *
 * Everything grows linearly with `scale`. Built in memory, never written to disk.
 */

import {
	DAS_PER_DOS,
	DOS_PER_LNODE,
	EXT_NS,
	EXT_PREFIX,
	IEDS_PER_SCALE,
	LNODES_PER_FUNCTION,
	LNS_PER_IED,
	SCL_NS,
	SIGNAL_GROUPS_PER_SCALE,
	SIGNALS_PER_GROUP,
} from './generate-scl-info-fixture.constants'

/** The fixture document and the counts a benchmark reports beside its timings. */
export function generateSclInfoFixture(params: { scale: number }): {
	xml: string
	lnodes: number
	signals: number
} {
	const scale = Math.max(1, Math.round(params.scale))
	const ieds = IEDS_PER_SCALE * scale
	const lnodes = ieds * LNS_PER_IED
	const signalGroups = SIGNAL_GROUPS_PER_SCALE * scale
	const groupEvery = Math.floor(lnodes / signalGroups)

	const parts: string[] = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<SCL xmlns="${SCL_NS}" xmlns:${EXT_PREFIX}="${EXT_NS}" version="2007" revision="C" release="5">`,
		`<Header id="info-bench" uuid="${uuid({ kind: 'header', index: 0 })}"/>`,
		`<Substation name="S1">`,
	]

	for (let lnode = 0; lnode < lnodes; lnode++) {
		if (lnode % LNODES_PER_FUNCTION === 0) {
			if (lnode > 0) parts.push(`</Function>`)
			parts.push(`<Function name="F${lnode / LNODES_PER_FUNCTION}">`)
		}
		const withSignals = lnode % groupEvery === 0 && lnode / groupEvery < signalGroups
		parts.push(
			`<SubFunction name="SF${lnode}">`,
			lnodeXml({ lnode, withSignals }),
			`</SubFunction>`,
		)
	}
	parts.push(`</Function>`, `</Substation>`)

	for (let ied = 0; ied < ieds; ied++) parts.push(iedXml({ ied }))

	parts.push(
		`<DataTypeTemplates>`,
		`<LNodeType id="LLN0_T" lnClass="LLN0"><DO name="Beh" type="SPS_T"/></LNodeType>`,
		`<LNodeType id="GGIO_T" lnClass="GGIO"><DO name="Ind1" type="SPS_T"/></LNodeType>`,
		`<DOType id="SPS_T" cdc="SPS"><DA name="stVal" bType="BOOLEAN" fc="ST"/></DOType>`,
		`</DataTypeTemplates>`,
		`</SCL>`,
	)

	return { xml: parts.join(''), lnodes, signals: signalGroups * SIGNALS_PER_GROUP }
}

function lnodeXml(params: { lnode: number; withSignals: boolean }): string {
	const { lnode, withSignals } = params
	const ied = Math.floor(lnode / LNS_PER_IED)
	const lnInst = (lnode % LNS_PER_IED) + 1
	const attributes =
		`iedName="IED${ied}" ldInst="LD1" lnClass="GGIO" lnInst="${lnInst}" lnType="GGIO_T"` +
		` uuid="${uuid({ kind: 'lnode', index: lnode })}" lnUuid="${uuid({ kind: 'ln', index: lnode })}"`

	const signals = withSignals ? signalsXml({ lnode }) : ''
	return `<LNode ${attributes}><Private type="${EXT_PREFIX}">${signals}${dataObjectsXml({ lnode })}</Private></LNode>`
}

function signalsXml(params: { lnode: number }): string {
	const refs: string[] = []
	for (let signal = 0; signal < SIGNALS_PER_GROUP; signal++) {
		refs.push(
			`<${EXT_PREFIX}:SourceRef uuid="${uuid({ kind: `signal-${params.lnode}`, index: signal })}" pLN="PTRC" pDO="Tr"` +
				` pDA="general" service="GOOSE" input="Input ${signal % 40}" inputInst="${(signal % 3) + 1}"/>`,
		)
	}
	return `<${EXT_PREFIX}:LNodeInputs>${refs.join('')}</${EXT_PREFIX}:LNodeInputs>`
}

function dataObjectsXml(params: { lnode: number }): string {
	const objects: string[] = []
	for (let dos = 0; dos < DOS_PER_LNODE; dos++) {
		const attributes: string[] = []
		for (let das = 0; das < DAS_PER_DOS; das++) {
			attributes.push(
				`<${EXT_PREFIX}:DAS name="da${das}"><Labels>` +
					`<Label id="L${params.lnode}_${dos}_${das}" lang="EN">Label ${dos}.${das}</Label>` +
					`</Labels></${EXT_PREFIX}:DAS>`,
			)
		}
		objects.push(`<${EXT_PREFIX}:DOS name="Do${dos}">${attributes.join('')}</${EXT_PREFIX}:DOS>`)
	}
	return objects.join('')
}

function iedXml(params: { ied: number }): string {
	const lns: string[] = []
	for (let ln = 0; ln < LNS_PER_IED; ln++) {
		const lnode = params.ied * LNS_PER_IED + ln
		lns.push(
			`<LN lnClass="GGIO" inst="${ln + 1}" lnType="GGIO_T" prefix="" uuid="${uuid({ kind: 'ln', index: lnode })}"/>`,
		)
	}
	return (
		`<IED name="IED${params.ied}" manufacturer="M" type="T">` +
		`<AccessPoint name="AP1"><Server><Authentication none="true"/>` +
		`<LDevice inst="LD1"><LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>${lns.join('')}</LDevice>` +
		`</Server></AccessPoint></IED>`
	)
}

/** A stable, well-formed uuid from a kind and a number, so runs are comparable. */
function uuid(params: { kind: string; index: number }): string {
	const { kind, index } = params
	let hash = 0
	for (const char of kind) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	const head = hash.toString(16).padStart(8, '0').slice(0, 8)
	const tail = index.toString(16).padStart(12, '0')
	return `${head}-0000-4000-8000-${tail}`
}
