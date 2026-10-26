/**
 * In-memory generator for a large, S-IED-shaped SCL document — a synthetic stand-in for a
 * large lab/system project (e.g. `big-lab-system`). Unlike `generate-scl-stress-fixtures.ts`
 * (one flat file per MB target, written to disk) this builds the string directly so it can run
 * inside the browser-mode `perf` vitest project, and it models the structure the S-IED
 * implementation walks: IEDs with LDevices and LNs, a Substation whose LNodes point at them, and
 * the `LNodeType` templates the LNs reference.
 *
 * Size is driven by `ieds`; every IED contributes `ldevicesPerIed * lnsPerLdevice` LNs and one
 * matching LNode in the Substation. Returns the XML plus the fixture characteristics to record
 * next to a measurement.
 */

const SCL_NS = 'http://www.iec.ch/61850/2003/SCL'

export type SclWorkloadParams = {
	ieds: number
	ldevicesPerIed: number
	lnsPerLdevice: number
	/** LNodes are spread over this many bays. */
	bays: number
}

export type SclWorkloadStats = SclWorkloadParams & {
	bytes: number
	lnCount: number
	lnodeCount: number
	lnodeTypeCount: number
	/** Rough element count (opening tags), a stable proxy for document size. */
	elementCount: number
}

export const SCL_WORKLOAD_LNODE_TYPES = ['MMXU', 'CSWI', 'XCBR', 'PTOC', 'GGIO'] as const

export function generateSclWorkload(params: SclWorkloadParams): {
	xml: string
	stats: SclWorkloadStats
} {
	const { ieds, ldevicesPerIed, lnsPerLdevice, bays } = params
	const lnClasses = SCL_WORKLOAD_LNODE_TYPES

	const bayParts: string[][] = Array.from({ length: bays }, () => [])
	const iedParts: string[] = []
	let lnodeCount = 0
	let lnCount = 0

	for (let i = 1; i <= ieds; i++) {
		const iedName = `IED_${i}`
		const ldevices: string[] = []
		for (let d = 1; d <= ldevicesPerIed; d++) {
			const ldInst = `LD${d}`
			const lns: string[] = [`<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>`]
			for (let l = 1; l <= lnsPerLdevice; l++) {
				const lnClass = lnClasses[l % lnClasses.length]
				lns.push(`<LN lnClass="${lnClass}" inst="${l}" lnType="${lnClass}_Type"/>`)
				bayParts[(i + d + l) % bays].push(
					`<LNode iedName="${iedName}" ldInst="${ldInst}" lnClass="${lnClass}" lnInst="${l}" lnType="${lnClass}_Type"/>`,
				)
				lnCount++
				lnodeCount++
			}
			ldevices.push(`<LDevice inst="${ldInst}">${lns.join('')}</LDevice>`)
		}
		iedParts.push(
			`<IED name="${iedName}" manufacturer="Vendor"><AccessPoint name="P1"><Server>${ldevices.join('')}</Server></AccessPoint></IED>`,
		)
	}

	const bayXml = bayParts
		.map((lnodes, index) => `<Bay name="B${index + 1}">${lnodes.join('')}</Bay>`)
		.join('')
	// Every LNodeType closes over the same DOType/EnumType, so importTypes has a real closure to walk.
	const typeXml = [
		`<LNodeType id="LLN0_Type" lnClass="LLN0"/>`,
		...lnClasses.map(
			(lnClass) =>
				`<LNodeType id="${lnClass}_Type" lnClass="${lnClass}"><DO name="Pos" type="DPC_Type"/></LNodeType>`,
		),
		`<DOType id="DPC_Type" cdc="DPC"><DA name="stVal" bType="Enum" type="BehaviourModeKind" fc="ST"/></DOType>`,
		`<EnumType id="BehaviourModeKind"><EnumVal ord="1">on</EnumVal></EnumType>`,
	].join('')

	const xml =
		`<?xml version="1.0" encoding="UTF-8"?>\n<SCL xmlns="${SCL_NS}">` +
		`<Substation name="S1"><VoltageLevel name="V1">${bayXml}</VoltageLevel></Substation>` +
		iedParts.join('') +
		`<DataTypeTemplates>${typeXml}</DataTypeTemplates></SCL>\n`

	return {
		xml,
		stats: {
			...params,
			bytes: new TextEncoder().encode(xml).length,
			lnCount,
			lnodeCount,
			lnodeTypeCount: lnClasses.length + 1,
			elementCount: (xml.match(/<[A-Za-z]/g) ?? []).length,
		},
	}
}
