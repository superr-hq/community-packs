"use step";
/**
 * Deploy wiring ONLY (D01 §5): extract from the input/config, call the
 * embedded pure functions, report a verdict. The `declare const` is the
 * type-level view of the compiler's embed-injection contract.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_set_state: {
  isValidStateKey(key: unknown): key is string;
  stateWriteRecord(key: string, value: unknown): { key: string; value: unknown };
};

export async function execute(
  input: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<StepOutcome<{ stateKey: string; storedValue: unknown }>> {
  const shared = __superrShared_set_state;
  if (!shared.isValidStateKey(config.key)) {
    return {
      ok: false,
      error: {
        code: 'EMPTY_STATE_KEY',
        message: 'state key must be a non-empty slug',
        details: { key: String(config.key) },
      },
    };
  }
  const record = shared.stateWriteRecord(config.key, input.value);
  return { ok: true, ports: { stateKey: record.key, storedValue: record.value } };
}
