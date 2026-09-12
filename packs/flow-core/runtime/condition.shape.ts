/**
 * Pure shaping logic for `condition` (§4.2: the mandatory parity source).
 * Dependency-free by contract; total — junk operands deactivate the branch
 * (matched=false) rather than throwing, because a gate's job is routing,
 * and config schema validation has already constrained the operator.
 */

export type ConditionOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'truthy'
  | 'falsy';

/** Stable JSON string (sorted keys) — deep equality for plain data. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value) ?? 'null';
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return stableStringify(a) === stableStringify(b);
  }
  return false;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Evaluate one condition. Unknown operators fail CLOSED to `false` — they
 * are unrepresentable through validated config, so reaching one means a
 * tampered IR must not activate anything.
 */
export function evaluateCondition(
  value: unknown,
  operator: unknown,
  compareTo: unknown,
): boolean {
  switch (operator) {
    case 'eq':
      return deepEqual(value, compareTo);
    case 'ne':
      return !deepEqual(value, compareTo);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const left = asNumber(value);
      const right = asNumber(compareTo);
      if (left === undefined || right === undefined) return false;
      if (operator === 'gt') return left > right;
      if (operator === 'gte') return left >= right;
      if (operator === 'lt') return left < right;
      return left <= right;
    }
    case 'contains': {
      if (typeof value === 'string' && typeof compareTo === 'string') {
        return value.includes(compareTo);
      }
      if (Array.isArray(value)) {
        return value.some((entry) => deepEqual(entry, compareTo));
      }
      return false;
    }
    case 'truthy':
      return Boolean(value);
    case 'falsy':
      return !value;
    default:
      return false;
  }
}

/** Branch labels — edge sourcePorts bind to exactly these two names. */
export function branchLabel(matched: boolean): 'true' | 'false' {
  return matched ? 'true' : 'false';
}
