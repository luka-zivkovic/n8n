import type { IExecutionResponse } from '@n8n/db';
import type {
	DataTableColumnJsType,
	DataTableColumnType,
	IDataObject,
	INode,
	INodeExecutionData,
	ITaskData,
	JsonValue,
} from 'n8n-workflow';
import {
	DATA_TABLE_SYSTEM_COLUMNS,
	EVALUATION_TRIGGER_NODE_TYPE,
	toDataTableColumnType,
	toDataTableValue,
} from 'n8n-workflow';

const MAX_CELL_BYTES = 64 * 1024;
const TRUNCATION_SENTINEL = '…[truncated]';
const RESERVED_COLUMN_NAMES = new Set([
	...DATA_TABLE_SYSTEM_COLUMNS,
	'row_id',
	'row_number',
	'_rowsLeft',
]);

export type InferredColumn = { name: string; type: DataTableColumnType };

export type InferSchemaResult = {
	columns: InferredColumn[];
	rows: IDataObject[];
	skippedExecutions: number;
	skippedColumns: string[];
	truncatedCellCount: number;
};

function getTaskJson(task: ITaskData): IDataObject | null {
	const items = task.data?.main?.[0] as INodeExecutionData[] | null | undefined;
	const json = items?.[0]?.json;
	if (json && typeof json === 'object') return json;
	return null;
}

function hasUsableKeys(payload: IDataObject | null): boolean {
	if (!payload) return false;
	for (const key of Object.keys(payload)) {
		if (!RESERVED_COLUMN_NAMES.has(key)) return true;
	}
	return false;
}

/**
 * Picks the seed payload for a successful execution.
 *
 * Strategy:
 * 1. Identify "production trigger" candidates — runData entries whose node is
 *    not the EvaluationTrigger, not disabled, and has no upstream source.
 * 2. Walk runs in execution order (lowest executionIndex first). Take the
 *    first one whose `data.main[0][0].json` has at least one non-reserved key.
 * 3. If no trigger output has usable keys (common for the manual trigger which
 *    emits `{}`), fall back to the first downstream node with usable output.
 *
 * Returns null when no usable payload can be found.
 */
export function pickProductionTriggerOutput(execution: IExecutionResponse): IDataObject | null {
	const runData = execution.data?.resultData?.runData;
	if (!runData) return null;

	const nodesByName = new Map<string, INode>();
	for (const node of execution.workflowData?.nodes ?? []) {
		nodesByName.set(node.name, node);
	}

	type Candidate = { name: string; task: ITaskData; isTrigger: boolean };
	const candidates: Candidate[] = [];

	for (const [name, taskRuns] of Object.entries(runData)) {
		const node = nodesByName.get(name);
		if (node?.type === EVALUATION_TRIGGER_NODE_TYPE) continue;
		if (node?.disabled) continue;

		const firstRun = taskRuns?.[0];
		if (!firstRun) continue;

		const source = firstRun.source ?? [];
		const isTrigger = source.length === 0 || source.every((s) => s === null);

		candidates.push({ name, task: firstRun, isTrigger });
	}

	if (candidates.length === 0) return null;

	candidates.sort((a, b) => (a.task.executionIndex ?? 0) - (b.task.executionIndex ?? 0));

	// First pass: trigger nodes with usable keys (the ideal case — webhook,
	// schedule with payload, etc.).
	for (const candidate of candidates) {
		if (!candidate.isTrigger) continue;
		const json = getTaskJson(candidate.task);
		if (hasUsableKeys(json)) return json;
	}

	// Fallback: the first non-trigger node with usable keys. This covers
	// manual-trigger workflows where the trigger emits {} and the seed data
	// only appears once the first downstream node runs.
	for (const candidate of candidates) {
		if (candidate.isTrigger) continue;
		const json = getTaskJson(candidate.task);
		if (hasUsableKeys(json)) return json;
	}

	return null;
}

/**
 * Infers a data table schema (columns + rows) from a list of successful
 * executions by extracting each execution's production trigger output.
 *
 * - Columns: union of top-level keys across all sampled executions; type per
 *   key derived from the first non-null value seen.
 * - Reserved column names (system columns + eval trigger row metadata) are
 *   skipped and reported in `skippedColumns`.
 * - Cell values exceeding MAX_CELL_BYTES are truncated with a sentinel.
 */
export function inferSchemaFromExecutions(executions: IExecutionResponse[]): InferSchemaResult {
	const payloads: IDataObject[] = [];
	let skippedExecutions = 0;
	for (const execution of executions) {
		const payload = pickProductionTriggerOutput(execution);
		if (payload === null) {
			skippedExecutions++;
			continue;
		}
		payloads.push(payload);
	}

	const columnOrder: string[] = [];
	const columnTypes = new Map<string, DataTableColumnType>();
	const skippedColumns = new Set<string>();

	for (const payload of payloads) {
		for (const key of Object.keys(payload)) {
			if (RESERVED_COLUMN_NAMES.has(key)) {
				skippedColumns.add(key);
				continue;
			}
			if (!columnTypes.has(key)) {
				columnOrder.push(key);
				columnTypes.set(key, 'string');
			}
			const currentType = columnTypes.get(key);
			if (currentType === 'string') {
				const value = payload[key];
				if (value !== null && value !== undefined) {
					const inferred = toDataTableColumnType(value as JsonValue);
					columnTypes.set(key, inferred);
				}
			}
		}
	}

	const columns: InferredColumn[] = columnOrder.map((name) => ({
		name,
		type: columnTypes.get(name) ?? 'string',
	}));

	let truncatedCellCount = 0;
	const rows: IDataObject[] = payloads.map((payload) => {
		const row: IDataObject = {};
		for (const { name, type } of columns) {
			const raw = payload[name];
			if (raw === undefined) {
				row[name] = null;
				continue;
			}
			const normalized = toDataTableValue(raw as JsonValue);
			if (typeof normalized === 'string' && byteLength(normalized) > MAX_CELL_BYTES) {
				row[name] = truncateToBytes(normalized, MAX_CELL_BYTES - TRUNCATION_SENTINEL.length);
				truncatedCellCount++;
				continue;
			}
			row[name] = coerceForColumnType(normalized, type);
		}
		return row;
	});

	return {
		columns,
		rows,
		skippedExecutions,
		skippedColumns: Array.from(skippedColumns),
		truncatedCellCount,
	};
}

function coerceForColumnType(
	value: DataTableColumnJsType,
	type: DataTableColumnType,
): DataTableColumnJsType {
	if (value === null) return null;
	// Only coerce when type was inferred to a non-string but the row has a
	// string (or vice versa) — defer all serious validation to the table's
	// existing insert validation. Keeping this minimal avoids surprises.
	if (type === 'date' && typeof value === 'string') {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) return parsed;
	}
	return value;
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, 'utf8');
}

function truncateToBytes(value: string, maxBytes: number): string {
	if (byteLength(value) <= maxBytes) return value + TRUNCATION_SENTINEL;
	const buffer = Buffer.from(value, 'utf8').subarray(0, maxBytes);
	return buffer.toString('utf8') + TRUNCATION_SENTINEL;
}
