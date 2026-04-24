import { UserError } from 'n8n-workflow';

export class EmptyExecutionHistoryError extends UserError {
	constructor(workflowId: string, reason: 'no-executions' | 'no-usable-data' = 'no-executions') {
		const message =
			reason === 'no-usable-data'
				? `No usable data found in workflow '${workflowId}' executions. The trigger and downstream nodes had empty outputs — try running the workflow with real input data first.`
				: `Workflow '${workflowId}' has no successful executions to build an evaluation dataset from`;
		super(message, { level: 'warning' });
	}
}
