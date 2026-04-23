import { z } from 'zod';

import { dataTableNameSchema } from '../../schemas/data-table.schema';
import { Z } from '../../zod-class';

export const CREATE_DATA_TABLE_FROM_EXECUTION_HISTORY_MAX_LIMIT = 100;
export const CREATE_DATA_TABLE_FROM_EXECUTION_HISTORY_DEFAULT_LIMIT = 20;

export class CreateDataTableFromExecutionHistoryDto extends Z.class({
	workflowId: z.string().min(1),
	name: dataTableNameSchema,
	limit: z
		.number()
		.int()
		.min(1)
		.max(CREATE_DATA_TABLE_FROM_EXECUTION_HISTORY_MAX_LIMIT)
		.default(CREATE_DATA_TABLE_FROM_EXECUTION_HISTORY_DEFAULT_LIMIT),
}) {}
