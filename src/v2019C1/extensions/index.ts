import { dataModel } from './data-model'
import { history } from './history'
import { template } from './template'

import { mergeExtensions } from '@dialecte/core/helpers'

export const EXTENSIONS = mergeExtensions({ history, dataModel, template })
