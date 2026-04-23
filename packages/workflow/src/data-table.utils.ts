import type { DataTableColumnJsType, DataTableColumnType } from './data-table.types';
import type { JsonValue } from './interfaces';
import { jsonStringify } from './utils';

export function toDataTableValue(value: JsonValue): DataTableColumnJsType {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value instanceof Date ||
		value === null
	) {
		return value;
	}

	return jsonStringify(value);
}

export function toDataTableColumnType(value: JsonValue): DataTableColumnType {
	switch (typeof value) {
		case 'string':
			return 'string';
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'object':
			if (value instanceof Date) {
				return 'date';
			}
			// catches null, arrays and objects — stringified to JSON
			return 'string';
		default:
			return 'string';
	}
}
