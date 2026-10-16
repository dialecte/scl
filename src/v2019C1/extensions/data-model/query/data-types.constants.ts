import { createDataTypeModel } from './data-types.helpers'

import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference/constants/type-id-pairs'

import type { DataTypeModel } from './data-types.types'
import type { Config } from '@/v2019C1/config'
import type { TreeSelect } from '@dialecte/core'

/** The attribute through which an LNode, LN or LN0 names its logical node type. */
export const LNODE_TYPE_ATTRIBUTE = TYPE_ID_REFERENCE_PAIRS.LNode[0].attribute

/** What one read of the data model keeps: the data type templates and everything in them. */
export const DATA_TYPES_SELECT = { DataTypeTemplates: true } satisfies TreeSelect<Config, 'SCL'>

/** The types of the data model, their members and how a data path walks them, read from the definition and the type-id references. */
export const DATA_TYPE_MODEL: DataTypeModel = createDataTypeModel()
