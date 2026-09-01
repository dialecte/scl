import {
	DEFINITION,
	ELEMENT_NAMES,
	ATTRIBUTES,
	CHILDREN,
	PARENTS,
	DESCENDANTS,
	ANCESTORS,
	ROOT_ELEMENT,
	SINGLETON_ELEMENTS,
} from '../definition'

import { XSI_NAMESPACE } from '@dialecte/core/helpers'

import type { IOConfig, AnyDialecteConfig, DatabaseConfig } from '@dialecte/core'

// SCL-specific IO configuration (hooks are provided on the Project instance, not here)
export const SCL_IO_CONFIG = {
	supportedFileExtensions: ['.fsd', '.asd', '.ssd', '.scd', '.isd', '.icd', '.iid', '.xml'],
} satisfies IOConfig

// SCL database configuration
export const SCL_DATABASE_CONFIG = {
	recordSchema: {
		primaryKey: 'id',
		indexes: ['tagName', 'parent.id', 'parent.tagName'],
		compoundIndexes: [['id', 'tagName']],
		arrayIndexes: ['children.id', 'children.tagName'],
	},
	/** @deprecated - kept for old io/ pipeline until Phase 5 removes it */
	tables: {
		xmlElements: {
			name: 'sclElements',
			schema:
				'id, tagName, [id+tagName], parent.id, parent.tagName, *children.id, *children.tagName',
		},
		additionalTables: {
			attachedFiles: {
				schema: 'id, filename, file',
			},
		},
	},
} as const satisfies DatabaseConfig

export const SCL_NAMESPACES = {
	default: { uri: 'http://www.iec.ch/61850/2003/SCL', prefix: '' },
	v2019C1: {
		uri: 'http://www.iec.ch/61850/2019/SCL/6-100',
		prefix: 'eIEC61850-6-100',
	},
	xsi: XSI_NAMESPACE,
} as const

export const SCL_DIALECTE_CONFIG = {
	rootElementName: ROOT_ELEMENT,
	singletonElements: SINGLETON_ELEMENTS,
	transparentElements: ['Private'] as const,
	elements: ELEMENT_NAMES,
	namespaces: SCL_NAMESPACES,
	attributes: ATTRIBUTES,
	children: CHILDREN,
	parents: PARENTS,
	descendants: DESCENDANTS,
	ancestors: ANCESTORS,
	database: SCL_DATABASE_CONFIG,
	io: SCL_IO_CONFIG,
	definition: DEFINITION,
} as const satisfies AnyDialecteConfig

export interface Config extends Readonly<typeof SCL_DIALECTE_CONFIG> {}
