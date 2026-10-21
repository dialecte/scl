import type { CorpusExclusion, ImportWarningCounts } from './corpus.types'

/** Where the corpus is synced, from the package root: the files the smoke runs. */
export const CORPUS_SMOKE_FOLDER = 'src/v2019C1/test/fixtures/corpus/smoke'

/** Where the other revisions of a family are kept, untouched, for fork tests: not in the smoke. */
export const CORPUS_PAIRS_FOLDER = 'src/v2019C1/test/fixtures/corpus/pairs'

/** The list of the families the sync writes beside the two folders. */
export const CORPUS_MANIFEST = 'src/v2019C1/test/fixtures/corpus/MANIFEST.md'

/** The Header of a file and the attributes the sync reads on it: its uuid, version and revision. */
export const HEADER_ELEMENT = /<(?:[A-Za-z_][\w.-]*:)?Header\b([^>]*)>/
export const HEADER_ATTRIBUTE = /\b(uuid|version|revision)\s*=\s*"([^"]*)"/g

/** How many bytes of a file are read to find its root element: past the XML declaration and a leading comment. */
export const ROOT_ELEMENT_WINDOW = 4096

/** The extensions a corpus file has. */
export const CORPUS_EXTENSIONS: readonly string[] = ['fsd', 'asd', 'ssd', 'xml']

/** The folders of the source left out, whatever their case: former versions the expert kept aside. */
export const CORPUS_LEFT_OUT_FOLDER = 'old'

/** The kinds of corpus file, each the folder it sits in. */
export const CORPUS_KIND_FOLDERS = {
	'fsd-baseline': '2 - FSD files/1 - FSD Baseline (Mandatory only)/',
	'fsd-extended': '2 - FSD files/2 - FSD In Use (Extended)/',
	asd: '3 - ASD files/',
	'ssd-template': '4 - SSD template files/',
	'ssd-system': '5 - SSD system files/',
} as const

/** When the excluded files were left out. */
const EXCLUDED_SINCE = '2026-10-20'

/**
 * The files the smoke runs, by their path under the corpus folder: the latest revision of each family (Header uuid)
 * that is not excluded, one copy of byte duplicates. The sync lists any difference.
 */
export const CORPUS_FILES: readonly string[] = [
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AATS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AEPC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AFLK.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AFSI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AFSL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AMSR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ANCR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/APOD.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ARCO.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ARIS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ARPC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ARUB.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ASEQ.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ASRC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ASWI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ATCC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AVCO.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CALH.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CCAP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CFPC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CILO.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CJCL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CPOW.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CREL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CSWI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CSYN.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DBAT.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DCHB.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DCHC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DCIP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DCST.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DCTS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DEXC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DFPF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DHFT.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DHVT.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DISL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DLFT.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DLVT.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DMDR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DPMC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DPVA.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DPVC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DPVM.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DRTF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DSTK.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DVER.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DVWC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FCSD.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FFIL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FFUN.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FLIM.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FPID.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FRMP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FSCC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FSPT.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/GAPC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/GGIO.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/GLOG.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/GSAL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/IARC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/IHMI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ISAF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ITCI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ITMI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ITPC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KFIL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KFIM.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KFLV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KFUL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KILL.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KTNK.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KTOW.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/KVLV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LBRI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LBSP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LCBI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LCBO.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LCCH.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LCDP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LCIV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LCMF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LCVF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LGOS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LLED.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LLN0v1r2.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPAI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPAO.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPBD.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPCP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPDO.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPHD.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPLD.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPMS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPPS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LSVS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LTIM.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LTMS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LTPC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LTPP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LTRK.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LTTC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LTTP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MENV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MFLK.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MHET.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MHYD.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MMDC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MMET.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MMTN.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MMTR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MMXN.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MMXU.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PDIF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PDIR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PDIS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PDOP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PDUP.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PFPE.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PFRC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PHAR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PHIZ.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PIOC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PLFR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PMHE.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PMHT.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PMOV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PMRI.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PMSS.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/POPF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PPAM.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PRTR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PSCH.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PSDE.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PSOF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTDV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTEF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTHF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTOC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTOF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTOV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTRC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTTR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTUC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTUF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTUV.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PUPF.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PVOC.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PVPH.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PZSU.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/QFVR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/QITR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/QIUB.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/QVTR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/QVUB.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/QVVR.fsd',
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/RADR.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/ATCC.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/CSWI.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/GAPC.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/GAPC_v2_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/GAPC_v3_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/Internal Comtrade Only.xml',
	'2 - FSD files/2 - FSD In Use (Extended)/LCBO.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/LCDP.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/LLN0.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/LPDI.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/LPDO.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/MMXU_v0_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/PDIS_v0_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/PDIS_v1_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/PSCH_v0_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/PTRC.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/RPSB_v0_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/SCBR.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/SIMG.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/SOPM.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/SOPM_v1_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/TCTR.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/TVTR.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/XCBRv2r2.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/XSWI_v0_r1.fsd',
	'2 - FSD files/2 - FSD In Use (Extended)/XSWI_v1_r1.fsd',
	'3 - ASD files/CB_App/CB_App.xml',
	'3 - ASD files/CB_Light/CB_Light.asd',
	'3 - ASD files/CB_Light/CB_Lightv1r2.asd',
	'3 - ASD files/HMI_App.asd',
	'3 - ASD files/P51_Light/P51_Appv0r2.asd',
	'3 - ASD files/Protections_P21_App/P21_App.asd',
	'3 - ASD files/RTU_DCS_App.asd',
	'4 - SSD template files/SLD_TFO_Bay v0r1.xml',
	'5 - SSD system files/SSD1/TEMPLATE_v1rA.ssd',
	'5 - SSD system files/SSD3/SUBSTATION_v1rA.ssd',
]

/** Joins an excluded file and its reason in the name of its case: the check-excluded report reads the file back. */
export const CORPUS_EXCLUDED_TITLE_SEPARATOR = ' — excluded: '

/**
 * The files of the source the sync leaves out, by their path under the source folder, each with the reason: the
 * schema refuses them, their references name nothing, or their content is wrong where no check looks. None is in the
 * smoke (a revision of a family of several revisions stays in the pairs, for fork tests); the sync counts them by
 * reason and `npm run corpus:check-excluded` runs the corpus checks on them, to find the ones fixed since.
 */
export const CORPUS_EXCLUDED: Readonly<Record<string, CorpusExclusion>> = {
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ActivePowerLimitLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AllEnergyDEResourceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AutomatedSequenceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AutomaticControlLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/AutomaticSwitchingLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/BaseConverterLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/BatteryChargerLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/BatteryLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ClockPortLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CmdEquipmentInterfaceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ConductorLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ControlEquipmentInterfaceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ControlledLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ControllingLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/CurrentProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DCCT.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DCTE.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DECP.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DERConverterLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DER_ActualPowerInformationLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DER_GeneratorLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DER_LoadLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DER_NameplateRatingsLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DER_OperationalSettingsLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DER_StateAbstractLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DER_StorageLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DEResourceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DFCL.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DFPM.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DGEN.fsd': {
		reason:
			'a structured attribute type has no member; an attribute names an enumeration the file does not hold',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DINV.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DLOD.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DPCC.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DRChannelLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DSTO.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DTRC.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/DomainLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/EarthfaultProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ElectricalContextReferenceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ElectricalReferenceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/EmergencyPowerControl_PowerRunUpRunBackLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/EnergyLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/EquipmentInterfaceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FACTSandPowerConversionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FSCH.fsd': {
		reason:
			'a structured attribute type has no member; an attribute names an enumeration the file does not hold',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FrequencyProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FunctionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/FunctionOutputLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/GeneratorNameplateRatingsLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/GeneratorProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/GeneratorUnitLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/HysteresisSnapshotLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/InstrumentTransformerLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LLN0.fsd': {
		reason: 'its specification naming writes an empty instance number',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LPDI.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LineSupervisionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LoadNameplateRatingsLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LoadUnitLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LowPassFilterOnFunctionInputLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/LowPassFilterOnFunctionOutputLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MSQI.fsd': {
		reason: 'a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/MotorStartupProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/NonProcessControllingEquipmentInterfaceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/NonProcessInterfaceLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/NonStorageOperationalSettingsLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/OperationalFunctionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PTPClockLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PhysicalElectricalConnectionPointLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class; a structured attribute type has no member',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PortBindingLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PowerFactorProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PowerProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/PowerQualityLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/ProtectionLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'2 - FSD files/1 - FSD Baseline (Mandatory only)/RampRatesLN.fsd': {
		reason:
			'its logical node class is an abstract model class, which the schema refuses as a class',
		since: EXCLUDED_SINCE,
	},
	'3 - ASD files/CB_Light/CB_Lightv1r3.xml': {
		reason: 'a power-system relation sits outside its list, without a name',
		since: EXCLUDED_SINCE,
	},
	'4 - SSD template files/Transformer Bay template v0r1.xml': {
		reason: 'six uuid references name elements of the files it was built from, not of this file',
		since: EXCLUDED_SINCE,
	},
	'4 - SSD template files/Transformer Bay template v0r2.xml': {
		reason: 'six uuid references name elements of the files it was built from, not of this file',
		since: EXCLUDED_SINCE,
	},
	'5 - SSD system files/SSD2/Transformer_Bay_Project_v1r1.ssd': {
		reason:
			'a relation reference names nothing, a relation points at the breaker of another bay, and the header revision disagrees with the history',
		since: EXCLUDED_SINCE,
	},
}

/**
 * The import warnings a corpus file is known to give, counted by type; a file not listed gives none. A new warning,
 * or one fewer, fails its case.
 */
export const CORPUS_EXPECTED_WARNINGS: Readonly<Record<string, ImportWarningCounts>> = {
	// a signal path written without its logical node, data names written as the logical node alone
	'3 - ASD files/P51_Light/P51_Appv0r2.asd': { 'incoherent-reference': 3 },
}
