// 최소 JSON Schema 검사기: templates/*.schema.json 을 유일한 정본으로 쓴다 (스키마를 코드에 복제하지 않기 위함).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../templates/', import.meta.url));
const cache = new Map();

function loadSchema(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(dir + name, 'utf8')));
  return cache.get(name);
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

/** @returns {string[]} 오류 목록 (비어 있으면 통과) */
function validate(value, schema, path = '$') {
  if (schema.$ref) return validate(value, loadSchema(schema.$ref), path);
  const errors = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} 는 ${schema.enum.join('|')} 중 하나여야 함`);
  if (schema.type) {
    const want = [].concat(schema.type);
    const t = typeOf(value);
    if (!want.includes(t) && !(t === 'integer' && want.includes('number'))) return [`${path}: ${want.join('|')} 이어야 하는데 ${t}`];
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) errors.push(`${path}: ${schema.minimum} 이상이어야 함`);
  if (typeOf(value) === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${path}.${k}: 필수 항목 없음`);
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k] ?? (schema.additionalProperties && typeof schema.additionalProperties === 'object' ? schema.additionalProperties : null);
      if (sub) errors.push(...validate(v, sub, `${path}.${k}`));
    }
  }
  if (typeOf(value) === 'array' && schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, `${path}[${i}]`)));
  return errors;
}

// 스키마로 못 표현하는 규칙: "신경 안 써도 됨"은 확인한 근거가 있을 때만 허용 (추정으로 무시 금지)
export function validateResult(r) {
  const errors = validate(r, loadSchema('result.schema.json'));
  (r?.findings ?? []).forEach((f, i) => {
    if (f?.disposition === 'NoActionNow') {
      for (const k of ['dispositionReason', 'dispositionEvidence', 'recheckWhen']) {
        if (!f[k]?.trim()) errors.push(`$.findings[${i}].${k}: NoActionNow 는 필수 (확인한 근거 없이 무시 불가)`);
      }
    }
  });
  return errors;
}
