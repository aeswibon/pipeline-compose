import * as fs from 'node:fs';
import type { ValidationIssue } from './validate-report.js';

export interface ValidatePolicy {
  /** Omit issues with these codes (waivers for gradual adoption). */
  allow?: string[];
  /** Promote warnings with these codes to errors. */
  deny?: string[];
}

export function parseValidatePolicy(raw: unknown): ValidatePolicy {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Validate policy must be a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  const policy: ValidatePolicy = {};
  if (doc.allow !== undefined) {
    if (!Array.isArray(doc.allow) || !doc.allow.every((code) => typeof code === 'string')) {
      throw new Error('policy.allow must be an array of issue code strings');
    }
    policy.allow = [...doc.allow];
  }
  if (doc.deny !== undefined) {
    if (!Array.isArray(doc.deny) || !doc.deny.every((code) => typeof code === 'string')) {
      throw new Error('policy.deny must be an array of issue code strings');
    }
    policy.deny = [...doc.deny];
  }
  if (!policy.allow?.length && !policy.deny?.length) {
    throw new Error('Validate policy must include allow and/or deny code lists');
  }
  return policy;
}

export function loadValidatePolicyFromFile(filePath: string): ValidatePolicy {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseValidatePolicy(JSON.parse(raw) as unknown);
}

export function applyValidatePolicy(
  issues: ValidationIssue[],
  policy: ValidatePolicy,
): ValidationIssue[] {
  const allow = new Set(policy.allow ?? []);
  const deny = new Set(policy.deny ?? []);

  return issues
    .filter((issue) => !allow.has(issue.code))
    .map((issue) =>
      deny.has(issue.code) && issue.level === 'warn'
        ? { ...issue, level: 'error' as const }
        : issue,
    );
}
