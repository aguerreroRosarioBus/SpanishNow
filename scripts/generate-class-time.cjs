// Una fuente TS, dos artefactos locales: ambos despliegues siguen siendo autónomos.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('../frontend/node_modules/typescript');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'frontend/src/app/core/time/class-time.ts');
const target = path.join(root, 'backend/src/domain/classTime.js');
const input = fs.readFileSync(source, 'utf8');
const fingerprint = createHash('sha256').update(input).digest('hex');
const header = '// GENERADO desde frontend/src/app/core/time/class-time.ts.\n'
  + '// Ejecutar node scripts/generate-class-time.cjs; no editar a mano.\n'
  + `// Fuente SHA256: ${fingerprint}\n`;
const output = header + ts.transpileModule(input, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
    console.error('La base temporal del backend no coincide con la fuente. Ejecutá node scripts/generate-class-time.cjs.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(target, output);
}
