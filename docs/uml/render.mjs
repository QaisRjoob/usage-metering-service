#!/usr/bin/env node
/**
 * Renders every docs/uml/*.puml to SVG and PNG with the public PlantUML server (plantuml.com).
 *
 *   node docs/uml/render.mjs
 *
 * The diagram source is encoded into the URL the way PlantUML expects (raw deflate + PlantUML's
 * base64 alphabet). The server reports syntax errors in the X-PlantUML-Diagram-Error header.
 * Environment: PLANTUML_SERVER (default https://www.plantuml.com/plantuml).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const SERVER = (process.env.PLANTUML_SERVER ?? 'https://www.plantuml.com/plantuml').replace(/\/$/, '');
const here = dirname(fileURLToPath(import.meta.url));
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

/** PlantUML's 6-bit encoding of the deflated source. */
function encode(source) {
  const data = deflateRawSync(Buffer.from(source, 'utf8'), { level: 9 });
  let out = '';
  for (let index = 0; index < data.length; index += 3) {
    const [b1, b2 = 0, b3 = 0] = [data[index], data[index + 1], data[index + 2]];
    out += ALPHABET[b1 >> 2] + ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)] + ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)] + ALPHABET[b3 & 0x3f];
  }
  return out;
}

async function render(file, format) {
  const response = await fetch(`${SERVER}/${format}/${encode(readFileSync(join(here, file), 'utf8'))}`);
  const error = response.headers.get('x-plantuml-diagram-error');
  const body = Buffer.from(await response.arrayBuffer());
  return { ok: response.ok && !error, status: response.status, error, line: response.headers.get('x-plantuml-diagram-error-line'), body };
}

const files = readdirSync(here).filter((file) => file.endsWith('.puml')).sort();
let failed = 0;
for (const format of ['svg', 'png']) mkdirSync(join(here, format), { recursive: true });
for (const file of files) {
  const name = file.replace(/\.puml$/, '');
  for (const format of ['svg', 'png']) {
    const result = await render(file, format);
    if (!result.ok) {
      failed += 1;
      console.log(`FAIL ${file} (${format}): HTTP ${result.status} ${result.error ?? ''} ${result.line ? `at line ${result.line}` : ''}`);
      continue;
    }
    writeFileSync(join(here, format, `${name}.${format}`), result.body);
  }
  console.log(`ok   ${file}`);
}
if (failed > 0) process.exit(1);
