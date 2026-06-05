// Token-efficient wire format for inter-agent payloads (protocols/brevit.md).
// Reality: brevit's brevity() is async, has NO decoder, and mangles nested
// arrays-of-objects. So we pre-flatten to a flat scalar dict, let brevit
// serialize that, and own a lossless unflatten. Abbreviations OFF.
// Scalars round-trip as strings (documented drift); null/[]/{} use sentinels.
//
// Step 0 escaping probe result (node /tmp/brevit-escape-probe.mjs):
//   brevit does NOT escape ':' ',' '\n' or any other character.
//   Values are emitted verbatim after "key:". Parsing: split on FIRST ':' only.
//   Values with embedded newlines break line-based decode → they correctly
//   fail roundTrips() and fall back to JSON in safeEncode. Acceptable per spec.
import { BrevitClient, BrevitConfig, JsonOptimizationMode } from 'brevit';

const NULL_SENTINEL = ' n';
const EMPTY_ARR_SENTINEL = ' []';
const EMPTY_OBJ_SENTINEL = ' {}';

function makeClient() {
  return new BrevitClient(new BrevitConfig({
    jsonMode: JsonOptimizationMode.Flatten,
    enableAbbreviations: false,
  }));
}

/** nested JS value -> flat { "a.0.b": "<scalar-as-string>" } */
export function flatten(value, prefix = '', out = {}) {
  const key = prefix === '' ? '$' : prefix;
  if (value === null) { out[key] = NULL_SENTINEL; return out; }
  if (typeof value !== 'object') { out[key] = String(value); return out; }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  if (entries.length === 0) {
    out[key] = Array.isArray(value) ? EMPTY_ARR_SENTINEL : EMPTY_OBJ_SENTINEL;
    return out;
  }
  for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** flat dict -> nested, reconstructing arrays from sequential numeric keys */
export function unflatten(flat) {
  const root = {};
  for (const [path, raw] of Object.entries(flat)) {
    const val =
      raw === NULL_SENTINEL ? null
      : raw === EMPTY_ARR_SENTINEL ? []
      : raw === EMPTY_OBJ_SENTINEL ? {}
      : raw;
    if (path === '$') return val;
    const parts = path.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === undefined) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return arrayify(root);
}

function arrayify(node) {
  if (node === null || typeof node !== 'object') return node;
  // Sentinel-resolved arrays (already []) pass through untouched.
  if (Array.isArray(node)) return node.map(arrayify);
  const keys = Object.keys(node);
  const isArr = keys.length > 0 && keys.every((k, i) => k === String(i));
  if (isArr) return keys.map((k) => arrayify(node[k]));
  const o = {};
  for (const k of keys) o[k] = arrayify(node[k]);
  return o;
}

/** string-normalized twin of x (matches what decode produces): scalars->string, null stays null. */
function normForGuard(v) {
  if (v === null) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(normForGuard);
  const o = {};
  for (const k of Object.keys(v)) o[k] = normForGuard(v[k]);
  return o;
}

/** async encode: pre-flatten then brevit-serialize the flat scalar dict. */
export async function encode(value) {
  const out = makeClient().brevity(flatten(value));
  return (out && typeof out.then === 'function') ? await out : out;
}

/** parse brevit's flat `key:value` lines back to a flat dict, then unflatten.
 *
 *  Step 0 calibration: brevit emits NO escaping. Values containing ':' are
 *  not quoted — so we split on the FIRST ':' in each line only (indexOf).
 *  Values with embedded '\n' break parsing: those payloads fail roundTrips()
 *  and safeEncode correctly falls back to JSON. */
export function decodeText(text) {
  if (typeof text === 'string' && text.trimStart().startsWith('{')) {
    return JSON.parse(text); // JSON fallback path
  }
  const flat = {};
  for (const line of String(text).split('\n')) {
    if (!line) continue;
    if (line.startsWith('@')) continue; // defensive: skip any abbreviation header
    const i = line.indexOf(':');
    if (i === -1) continue;
    const k = line.slice(0, i);
    // Split on first ':' only — brevit emits colons in values unescaped.
    const v = line.slice(i + 1);
    flat[k] = v;
  }
  return unflatten(flat);
}

/** true iff decode(encode(x)) reproduces the string-normalized twin of x. */
export async function roundTrips(value) {
  try {
    const encoded = await encode(value);
    const restored = decodeText(encoded);
    return JSON.stringify(restored) === JSON.stringify(normForGuard(value));
  } catch {
    return false;
  }
}

/** encode if it round-trips; else fall back to raw JSON. Never throws, never loses data. */
export async function safeEncode(value) {
  try {
    if (await roundTrips(value)) return await encode(value);
  } catch { /* fall through */ }
  return JSON.stringify(value);
}
