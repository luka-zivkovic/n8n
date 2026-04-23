import { UserError } from 'n8n-workflow';

export class EmptyExecutionHistoryError extends UserError {
	constructor(workflowId: string) {
		super(
			`Workflow '${workflowId}' has no successful executions to build an evaluation dataset from`,
			{ level: 'warning' },
		);
	}
}
