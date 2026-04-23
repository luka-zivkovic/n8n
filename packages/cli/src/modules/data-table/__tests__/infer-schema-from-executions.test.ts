import type { IExecutionResponse } from '@n8n/db';
import type { ITaskData } from 'n8n-workflow';
import { EVALUATION_TRIGGER_NODE_TYPE } from 'n8n-workflow';

import {
	inferSchemaFromExecutions,
	pickProductionTriggerOutput,
} from '../utils/infer-schema-from-executions';

const makeTask = (
	json: Record<string, unknown>,
	overrides: Partial<ITaskData> = {},
): ITaskData =>
	({
		startTime: 0,
		executionTime: 1,
		executionStatus: 'success',
		executionIndex: 0,
		source: [null],
		data: { main: [[{ json }]] },
		...overrides,
	}) as unknown as ITaskData;

const makeExecution = (
	runData: Record<string, ITaskData[]>,
	nodes: Array<{ name: string; type: string; disabled?: boolean }>,
): IExecutionResponse =>
	({
		data: { resultData: { runData } },
		workflowData: {
			nodes: nodes.map((n) => ({
				name: n.name,
				type: n.type,
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
				disabled: n.disabled ?? false,
			})),
		},
	}) as unknown as IExecutionResponse;

describe('pickProductionTriggerOutput', () => {
	it('returns null when there is no runData', () => {
		const exec = { data: { resultData: {} }, workflowData: { nodes: [] } } as unknown as IExecutionResponse;
		expect(pickProductionTriggerOutput(exec)).toBeNull();
	});

	it('returns the production trigger output, ignoring evaluation trigger', () => {
		const exec = makeExecution(
			{
				EvalTrigger: [makeTask({ rowFromEval: 1 }, { executionIndex: 0 })],
				Webhook: [makeTask({ name: 'alice', age: 30 }, { executionIndex: 1 })],
			},
			[
				{ name: 'EvalTrigger', type: EVALUATION_TRIGGER_NODE_TYPE },
				{ name: 'Webhook', type: 'n8n-nodes-base.webhook' },
			],
		);
		expect(pickProductionTriggerOutput(exec)).toEqual({ name: 'alice', age: 30 });
	});

	it('skips disabled nodes', () => {
		const exec = makeExecution(
			{
				DisabledTrigger: [makeTask({ shouldNotPick: true })],
				Webhook: [makeTask({ name: 'bob' }, { executionIndex: 1 })],
			},
			[
				{ name: 'DisabledTrigger', type: 'n8n-nodes-base.webhook', disabled: true },
				{ name: 'Webhook', type: 'n8n-nodes-base.webhook' },
			],
		);
		expect(pickProductionTriggerOutput(exec)).toEqual({ name: 'bob' });
	});

	it('returns null when only the evaluation trigger has runs', () => {
		const exec = makeExecution(
			{ EvalTrigger: [makeTask({ rowFromEval: 1 })] },
			[{ name: 'EvalTrigger', type: EVALUATION_TRIGGER_NODE_TYPE }],
		);
		expect(pickProductionTriggerOutput(exec)).toBeNull();
	});

	it('skips candidates whose source is not [null]', () => {
		const exec = makeExecution(
			{
				ChildNode: [
					makeTask(
						{ name: 'no-trigger' },
						{ executionIndex: 0, source: [{ previousNode: 'Trigger' }] },
					),
				],
			},
			[{ name: 'ChildNode', type: 'n8n-nodes-base.set' }],
		);
		expect(pickProductionTriggerOutput(exec)).toBeNull();
	});

	it('picks the candidate with the lowest executionIndex when multiple triggers fired', () => {
		const exec = makeExecution(
			{
				WebhookA: [makeTask({ source: 'A' }, { executionIndex: 5 })],
				WebhookB: [makeTask({ source: 'B' }, { executionIndex: 2 })],
			},
			[
				{ name: 'WebhookA', type: 'n8n-nodes-base.webhook' },
				{ name: 'WebhookB', type: 'n8n-nodes-base.webhook' },
			],
		);
		expect(pickProductionTriggerOutput(exec)).toEqual({ source: 'B' });
	});
});

describe('inferSchemaFromExecutions', () => {
	const triggerExec = (json: Record<string, unknown>): IExecutionResponse =>
		makeExecution({ Webhook: [makeTask(json)] }, [
			{ name: 'Webhook', type: 'n8n-nodes-base.webhook' },
		]);

	it('returns empty result for empty input', () => {
		const result = inferSchemaFromExecutions([]);
		expect(result.columns).toEqual([]);
		expect(result.rows).toEqual([]);
		expect(result.skippedExecutions).toBe(0);
	});

	it('unions keys across heterogeneous executions; missing keys become null', () => {
		const result = inferSchemaFromExecutions([
			triggerExec({ a: 1, b: 'two' }),
			triggerExec({ b: 'three', c: true }),
		]);
		expect(result.columns.map((c) => c.name).sort()).toEqual(['a', 'b', 'c']);
		expect(result.rows[0]).toEqual({ a: 1, b: 'two', c: null });
		expect(result.rows[1]).toEqual({ a: null, b: 'three', c: true });
	});

	it('infers types from the first non-null value', () => {
		const result = inferSchemaFromExecutions([
			triggerExec({ s: 'hi', n: 42, b: false, d: '2024-01-01T00:00:00.000Z' }),
		]);
		const types = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
		expect(types).toMatchObject({ s: 'string', n: 'number', b: 'boolean' });
	});

	it('falls back to string for keys whose values are always null', () => {
		const result = inferSchemaFromExecutions([
			triggerExec({ x: null }),
			triggerExec({ x: null }),
		]);
		expect(result.columns).toEqual([{ name: 'x', type: 'string' }]);
	});

	it('json-stringifies nested objects/arrays', () => {
		const result = inferSchemaFromExecutions([triggerExec({ obj: { nested: 1 }, arr: [1, 2] })]);
		expect(result.columns.find((c) => c.name === 'obj')?.type).toBe('string');
		expect(result.rows[0].obj).toBe('{"nested":1}');
		expect(result.rows[0].arr).toBe('[1,2]');
	});

	it('reports skipped reserved column names without including them in schema', () => {
		const result = inferSchemaFromExecutions([
			triggerExec({ id: 5, row_id: 'x', value: 1 }),
		]);
		const names = result.columns.map((c) => c.name);
		expect(names).not.toContain('id');
		expect(names).not.toContain('row_id');
		expect(names).toContain('value');
		expect(result.skippedColumns).toEqual(expect.arrayContaining(['id', 'row_id']));
	});

	it('truncates oversized cell values and counts truncations', () => {
		const huge = 'x'.repeat(70 * 1024);
		const result = inferSchemaFromExecutions([triggerExec({ big: huge })]);
		expect(result.truncatedCellCount).toBe(1);
		expect(typeof result.rows[0].big).toBe('string');
		expect((result.rows[0].big as string).endsWith('…[truncated]')).toBe(true);
	});

	it('counts skipped executions when no production trigger is detected', () => {
		const evalOnly = makeExecution(
			{ EvalTrigger: [makeTask({ rowFromEval: 1 })] },
			[{ name: 'EvalTrigger', type: EVALUATION_TRIGGER_NODE_TYPE }],
		);
		const result = inferSchemaFromExecutions([evalOnly, triggerExec({ ok: true })]);
		expect(result.skippedExecutions).toBe(1);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]).toEqual({ ok: true });
	});
});
