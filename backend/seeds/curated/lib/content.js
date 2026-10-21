// Loads and validates the curated course content (seeds/content/*.json).
// Everything here is data: editing a JSON file and re-running `npm run db:seed:curated` is the whole workflow.
const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.resolve(__dirname, '..', '..', 'content');
const ACCOUNTS_FILE = path.resolve(__dirname, '..', '..', 'local-test-accounts.json');

// Typical mojibake: UTF-8 bytes shown as CP437 ("d├¡as", "┬┐") or as Latin-1/Windows-1252 ("dÃ­as", "â€œ"), or U+FFFD.
const MOJIBAKE = /[─-╿▀-▟�]|Ã[\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]|â€|Â[ -¿]/;

function assertCleanText(value, where) {
  if (typeof value === 'string') {
    if (MOJIBAKE.test(value)) throw new Error(`${where}: looks like broken encoding (mojibake): ${JSON.stringify(value.slice(0, 80))}`);
    if (value !== value.normalize('NFC')) throw new Error(`${where}: text is not NFC-normalised: ${JSON.stringify(value.slice(0, 80))}`);
    if (value !== value.trim() && !where.endsWith('.text')) throw new Error(`${where}: leading/trailing whitespace`);
  } else if (Array.isArray(value)) value.forEach((v, i) => assertCleanText(v, `${where}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) assertCleanText(v, `${where}.${k}`);
}

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const normalizeKey = value => String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');

function loadContent() {
  const file = path.join(CONTENT_DIR, 'course.json');
  const { course, units } = readJson(file);
  assertCleanText({ course, units }, 'course.json');

  const storiesDir = path.join(CONTENT_DIR, 'stories');
  const stories = fs.readdirSync(storiesDir).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ file: f, ...readJson(path.join(storiesDir, f)) }));
  stories.forEach(s => assertCleanText({ ...s, file: undefined }, s.file));

  // Referential and uniqueness checks, so a typo fails here and not halfway through a database write.
  const unique = (label, values) => {
    const seen = new Set();
    for (const v of values) {
      if (seen.has(v)) throw new Error(`Duplicate ${label}: ${v}`);
      seen.add(v);
    }
  };
  unique('unit id', units.map(u => u.id));
  unique('vocabulary id', units.flatMap(u => u.vocabulary.map(v => v.id)));
  unique('vocabulary word', units.flatMap(u => u.vocabulary.map(v => normalizeKey(v.word))));
  unique('story id', stories.map(s => s.id));
  unique('story title', stories.map(s => normalizeKey(s.title)));
  unique('question id', stories.flatMap(s => s.questions.map(q => q.id)));
  for (const s of stories) {
    if (!units.some(u => u.id === s.unitId)) throw new Error(`${s.file}: unknown unitId ${s.unitId}`);
    unique(`question text in ${s.file}`, s.questions.map(q => normalizeKey(q.text)));
    for (const q of s.questions) {
      if (q.type === 'choice' && !(Array.isArray(q.options) && q.options.includes(q.correct))) {
        throw new Error(`${s.file}: question "${q.text}" needs options that include the correct answer`);
      }
    }
  }
  return { course, units, stories };
}

function loadAccounts() {
  const { accounts, password } = readJson(ACCOUNTS_FILE);
  if (!Array.isArray(accounts) || !accounts.some(a => a.role === 'teacher') || !accounts.some(a => a.role === 'student')) {
    throw new Error('local-test-accounts.json needs at least one teacher and one student');
  }
  return { accounts, filePassword: password };
}

module.exports = { loadContent, loadAccounts, assertCleanText, normalizeKey, MOJIBAKE };
