/**
 * SCL stress-fixture generator for the importTypes benchmark — the scl mirror of core's
 * `generate-stress-fixtures.ts`. Emits a single valid SCL document whose size is driven by
 * one knob: the number of type-closure units. Each unit is a CSWI `LNode` instance plus its
 * `LNodeType -> DOType -> EnumType` chain (the same shape the passing importTypes tests use),
 * so a bigger target file means a bigger `DataTypeTemplates` and more typed instances — the
 * exact growth `importTypes` walks.
 *
 * Files are large and NOT source-controlled — only this script is. Output lands in `./data/`
 * (git-ignored); regenerate on demand before a benchmark run:
 *
 *   node --import=tsx src/v2019C1/test/fixtures/generate-scl-stress-fixtures.ts        # 5..500 MB
 *   node --import=tsx src/v2019C1/test/fixtures/generate-scl-stress-fixtures.ts 5 50   # only those
 */
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCL_NS = 'http://www.iec.ch/61850/2003/SCL'
const DEFAULT_SIZES_MB = [5, 10, 50, 100, 200, 500]
const FLUSH_AT = 8 * 1024 * 1024 // 8 MB buffer before a stream write

/** One unit: a CSWI LNode instance + its LNodeType -> DOType -> EnumType chain (distinct ids). */
function unitInstance(i: number): string {
	return `<LNode iedName="None" lnClass="CSWI" lnInst="${i}" lnType="CSWI_Type_${i}" __id="lnode-${i}"/>`
}
function unitTypes(i: number): string {
	return (
		`<LNodeType id="CSWI_Type_${i}" lnClass="CSWI" __id="lnt-${i}"><DO name="Pos" type="DPC_Type_${i}" __id="do-${i}"/></LNodeType>` +
		`<DOType id="DPC_Type_${i}" cdc="DPC" __id="dot-${i}"><DA name="stVal" bType="Enum" type="Enum_${i}" fc="ST" __id="da-${i}"/></DOType>` +
		`<EnumType id="Enum_${i}" __id="et-${i}"><EnumVal ord="1" __id="ev-${i}">on</EnumVal></EnumType>`
	)
}

/** Awaitable `stream.write` that honors backpressure. */
function write(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
	return new Promise((resolve, reject) => {
		stream.write(chunk, (err) => (err ? reject(err) : resolve()))
	})
}

/** Bytes one unit contributes (instance + its 3 types), used to size the file to a target. */
function bytesPerUnit(): number {
	return Buffer.byteLength(unitInstance(1_000_000)) + Buffer.byteLength(unitTypes(1_000_000))
}

/**
 * Stream a well-formed SCL doc to `outPath` until it reaches ~`targetBytes`. Instances live
 * under one Bay, their types under DataTypeTemplates — both grow with the unit count.
 * Returns the unit (= type-closure) count and byte size.
 */
export async function generateSclStress(params: {
	outPath: string
	targetBytes: number
}): Promise<{ units: number; bytes: number }> {
	await mkdir(dirname(params.outPath), { recursive: true })
	const stream = createWriteStream(params.outPath, { encoding: 'utf8' })

	const header =
		`<?xml version="1.0" encoding="UTF-8"?>\n<SCL xmlns="${SCL_NS}" __id="scl-stress">` +
		`<Substation name="S1" __id="sub-1"><VoltageLevel name="V1" __id="vl-1"><Bay name="B1" __id="bay-1">`
	const midSubToDtt = `</Bay></VoltageLevel></Substation><DataTypeTemplates __id="dtt-1">`
	const footer = `</DataTypeTemplates></SCL>\n`

	const overhead = Buffer.byteLength(header + midSubToDtt + footer)
	const units = Math.max(1, Math.floor((params.targetBytes - overhead) / bytesPerUnit()))

	await write(stream, header)
	// Pass 1 — instances under the Bay.
	let buffer = ''
	for (let i = 1; i <= units; i++) {
		buffer += unitInstance(i)
		if (buffer.length >= FLUSH_AT) {
			await write(stream, buffer)
			buffer = ''
		}
	}
	if (buffer) await write(stream, buffer)
	await write(stream, midSubToDtt)
	// Pass 2 — the matching type closures under DataTypeTemplates.
	buffer = ''
	for (let i = 1; i <= units; i++) {
		buffer += unitTypes(i)
		if (buffer.length >= FLUSH_AT) {
			await write(stream, buffer)
			buffer = ''
		}
	}
	if (buffer) await write(stream, buffer)
	await write(stream, footer)

	await new Promise<void>((resolve, reject) =>
		stream.end((err?: Error) => (err ? reject(err) : resolve())),
	)
	return { units, bytes: overhead + units * bytesPerUnit() }
}

async function main(): Promise<void> {
	const here = dirname(fileURLToPath(import.meta.url))
	const dataDir = join(here, 'data')
	const argSizes = process.argv
		.slice(2)
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0)
	const sizes = argSizes.length > 0 ? argSizes : DEFAULT_SIZES_MB

	for (const mb of sizes) {
		const outPath = join(dataDir, `scl-stress-${mb}mb.scd`)
		const { units, bytes } = await generateSclStress({ outPath, targetBytes: mb * 1024 * 1024 })
		console.log(
			`${outPath}  ${(bytes / 1024 / 1024).toFixed(1)} MB  (${units.toLocaleString()} type closures)`,
		)
	}
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
