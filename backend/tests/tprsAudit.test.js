// TPRS audit rules (src/services/tprsAudit.js) on in-memory fixtures. Independent of seeds/content (which keeps changing).
const path = require('path');
const { spawnSync } = require('child_process');
const {
  auditCourse, fromContent, planFromContent, planFromBlocks, containsExpression, contentStems, RULES
} = require('../src/services/tprsAudit');
const { buildBlocks } = require('../seeds/curated/lib/plan');
const { normalizeKey } = require('../seeds/curated/lib/content');
const { parseArgs, isLocalHost } = require('../src/db/auditTprs');

const BACKEND = path.resolve(__dirname, '..');

// A course that passes every rule: three stories, the first two schedule a reappearance in a later one.
const yesNo = (text, correct = 'Sí') => ({ text, type: 'yes_no', options: ['Sí', 'No'], correct });
const choice = (text, options, correct) => ({ text, type: 'choice', options, correct });

function baseline() {
  const unit = { id: 1, order: 1, title: 'Unidad 1' };
  return {
    vocabulary: ['Me llamo', 'Tiene', 'Gato', 'Come', 'Perro', 'Hola'].map(word => ({ word })),
    stories: [
      {
        id: 1, title: 'Uno', unit, order: 100,
        text: 'Ana tiene un gato. El gato come pan. Ana dice: "Me llamo Ana".',
        questions: [yesNo('¿Ana tiene un gato?'), choice('¿Qué come el gato?', ['Pan', 'Pez'], 'Pan')],
        plan: {
          before: [{ expression: 'Tiene', role: 'target' }, { expression: 'Me llamo', role: 'target' }],
          keyframes: [
            { text: 'Ana tiene un gato.', questions: ['¿Ana tiene un gato?'] },
            { text: 'El gato come pan.', questions: ['¿Qué come el gato?'] },
            { text: 'Ana dice: "Me llamo Ana".', questions: [] }
          ],
          after: [{ type: 'full_story' }, { type: 'flashcards' }],
          later: [{ expression: 'Me llamo', role: 'revisit', storyTitle: 'Dos' }]
        }
      },
      {
        id: 2, title: 'Dos', unit, order: 200,
        text: 'Luis dice: "Me llamo Luis". Luis tiene un perro. El perro come pan.',
        questions: [yesNo('¿Luis tiene un perro?'), yesNo('¿Luis tiene un gato?', 'No')],
        plan: {
          before: [{ expression: 'Me llamo', role: 'revisit' }, { expression: 'Perro', role: 'target' }, { expression: 'Come', role: 'target' }],
          keyframes: [
            { text: 'Luis dice: "Me llamo Luis".', questions: [] },
            { text: 'Luis tiene un perro.', questions: ['¿Luis tiene un perro?'] },
            { text: 'El perro come pan.', questions: [] }
          ],
          after: [{ type: 'full_story' }, { type: 'flashcards' }, { type: 'matching' }],
          later: [{ expression: 'Come', role: 'revisit', storyTitle: 'Tres' }]
        }
      },
      {
        id: 3, title: 'Tres', unit: { id: 2, order: 2, title: 'Unidad 2' }, order: 100,
        text: 'Eva come pan. Eva tiene un gato. Eva dice: "Hola".',
        questions: [yesNo('¿Eva come pan?')],
        plan: {
          before: [{ expression: 'Come', role: 'revisit' }, { expression: 'Gato', role: 'target' }, { expression: 'Hola', role: 'target' }],
          keyframes: [
            { text: 'Eva come pan. Eva tiene un gato.', questions: ['¿Eva come pan?'] },
            { text: 'Eva dice: "Hola".', questions: [] }
          ],
          after: [{ type: 'full_story' }, { type: 'listen_repeat' }],
          later: []
        }
      }
    ]
  };
}

/** Audits the baseline after `mutate(model)`; returns { rules: key -> rule result } for `title` (default: the first story). */
function run(mutate, title = 'Uno') {
  const model = baseline();
  if (mutate) mutate(model);
  const course = auditCourse(model);
  const story = course.stories.find(s => s.title === title);
  return { course, rules: Object.fromEntries(story.rules.map(r => [r.key, r])) };
}
const story = (model, title = 'Uno') => model.stories.find(s => s.title === title);
const messages = rule => rule.findings.map(f => `${f.level}: ${f.message}`);

describe('baseline fixture', () => {
  test('passes every rule on every story', () => {
    const { course } = run();
    for (const s of course.stories) for (const r of s.rules) expect([s.title, r.key, r.status, messages(r)]).toEqual([s.title, r.key, 'ok', []]);
    expect(course.summary).toMatchObject({ stories: 3, errors: 0, warnings: 0, storiesClean: 3 });
  });

  test('stories are audited in unit / story order, whatever the input order', () => {
    const model = baseline();
    model.stories.reverse();
    expect(auditCourse(model).stories.map(s => s.title)).toEqual(['Uno', 'Dos', 'Tres']);
  });
});

describe('text matching', () => {
  test('ignores accents, case, punctuation and simple inflection; needs consecutive words', () => {
    expect(containsExpression('Los libros cuestan mucho', 'Cuestan')).toBe(true);
    expect(containsExpression('Yo me llamo María', 'Me llamo')).toBe(true);
    expect(containsExpression('"¡BUENOS DIAS!", dice', 'Buenos días')).toBe(true);
    expect(containsExpression('Los gatos comen pan', 'Gato')).toBe(true);
    expect(containsExpression('La gata come', 'Gato')).toBe(true);
    expect(containsExpression('Ellos tienen un perro', 'Tiene')).toBe(true);
    expect(containsExpression('Me gusta llamo', 'Me llamo')).toBe(false);
    expect(containsExpression('Ana come pan', 'Perro')).toBe(false);
    expect(containsExpression('Ana come pan', '')).toBe(false);
  });

  test('content stems skip articles, question words and short words', () => {
    expect(contentStems('¿Dónde está el gato de María?')).toEqual(expect.arrayContaining(['gat', 'mari']));
    expect(contentStems('¿Dónde está el gato de María?')).not.toContain('donde');
  });
});

describe('R1 target structures', () => {
  test('2 or 3 targets pass; revisit and support do not count', () => {
    const { rules } = run(m => story(m).plan.before.push({ expression: 'Gato', role: 'support' }, { expression: 'Hola', role: 'revisit' }));
    expect(rules.targets.status).toBe('ok');
  });
  test('no targets is an error', () => {
    expect(run(m => { story(m).plan.before = []; }).rules.targets.status).toBe('error');
  });
  test('one target or four targets is a warning', () => {
    expect(run(m => { story(m).plan.before.pop(); }).rules.targets.status).toBe('warning');
    expect(run(m => story(m).plan.before.push({ expression: 'Gato' }, { expression: 'Come', role: 'target' })).rules.targets.status).toBe('warning');
  });
  test('five or more targets is an error', () => {
    const { rules } = run(m => story(m).plan.before.push({ expression: 'Gato' }, { expression: 'Come' }, { expression: 'Hola' }));
    expect(rules.targets.status).toBe('error');
    expect(messages(rules.targets)[0]).toMatch(/5 expresiones objetivo/);
  });
  test('a target that is not in the story text is an error', () => {
    const { rules } = run(m => story(m).plan.before.push({ expression: 'Perro', role: 'target' }));
    expect(rules.targets.status).toBe('error');
    expect(messages(rules.targets).join()).toMatch(/«Perro» no aparece/);
  });
  test('an inflected form of the target counts as appearing', () => {
    const { rules } = run(m => { story(m).text = story(m).text.replace('tiene', 'tienen'); story(m).plan.keyframes[0].text = 'Ana tienen un gato.'; });
    expect(rules.targets.status).toBe('ok');
  });
});

describe('R2 comprehensible keyframes', () => {
  test('no keyframes is an error; a single keyframe is a warning', () => {
    expect(run(m => { story(m).plan.keyframes = []; }).rules.keyframes.status).toBe('error');
    const single = run(m => { story(m).plan.keyframes = [{ text: story(m).text, questions: [] }]; });
    expect(single.rules.keyframes.status).toBe('warning');
    expect(messages(single.rules.keyframes)[0]).toMatch(/un solo keyframe/);
  });
  test('more than 45 words or fewer than 3 is a warning', () => {
    const long = Array.from({ length: 46 }, (_, i) => `palabra${i}`).join(' ');
    let r = run(m => { story(m).text = long; story(m).plan.keyframes = [{ text: long, questions: [] }, { text: 'Ana dice hola', questions: [] }]; story(m).plan.before = []; }).rules.keyframes;
    expect(messages(r).join()).toMatch(/keyframe 1: 46 palabras/);
    r = run(m => { story(m).text = 'Ana tiene un gato. Come pan.'; story(m).plan.keyframes = [{ text: 'Ana tiene un gato.', questions: [] }, { text: 'Come pan.', questions: [] }]; }).rules.keyframes;
    expect(r.status).toBe('warning');
    expect(messages(r).join()).toMatch(/keyframe 2: 2 palabras/);
  });
  test('exactly 45 and exactly 3 words pass', () => {
    const exact = Array.from({ length: 45 }, (_, i) => `p${i}`).join(' ');
    const r = run(m => { story(m).text = `${exact} uno dos tres`; story(m).plan.keyframes = [{ text: exact, questions: [] }, { text: 'uno dos tres', questions: [] }]; }).rules.keyframes;
    expect(r.status).toBe('ok');
  });
  test('keyframes that do not add up to the story text are an error; spacing differences are not', () => {
    expect(run(m => { story(m).plan.keyframes[1].text = 'El gato come pescado.'; }).rules.keyframes.status).toBe('error');
    expect(run(m => { story(m).text = story(m).text.replace(/\. /g, '.\n\n'); }).rules.keyframes.status).toBe('ok');
  });
});

describe('R3 comprehension checks during the story', () => {
  test('no question during the narration: error with 2+ keyframes, warning with one', () => {
    const none = run(m => story(m).plan.keyframes.forEach(k => { k.questions = []; })).rules.during;
    expect(none.status).toBe('error');
    const one = run(m => { story(m).plan.keyframes = [{ text: story(m).text, questions: [] }]; }).rules.during;
    expect(one.status).toBe('warning');
  });
  test('a choice question needs its answer among the options (error)', () => {
    const r = run(m => { story(m).questions[1].correct = 'Carne'; }).rules.during;
    expect(r.status).toBe('error');
    expect(messages(r).join()).toMatch(/no está entre las opciones/);
  });
  test('a yes/no question must have Sí or No as answer (error), options ["Sí","No"] (warning)', () => {
    expect(run(m => { story(m).questions[0].correct = 'Quizás'; }).rules.during.status).toBe('error');
    expect(run(m => { story(m).questions[0].options = ['Verdadero', 'Falso']; }).rules.during.status).toBe('warning');
    expect(run(m => { story(m).questions[0].correct = 'si'; }).rules.during.status).toBe('ok');
  });
  test('choice between three or more options is a warning; a single option too; two options pass', () => {
    const three = run(m => { story(m).questions[1].options = ['Pan', 'Pez', 'Carne']; }).rules.during;
    expect(three.status).toBe('warning');
    expect(messages(three)[0]).toMatch(/3 opciones/);
    expect(run(m => { story(m).questions[1].options = ['Pan']; }).rules.during.status).toBe('warning');
  });
  test('a question about something that only appears in a later keyframe is an error', () => {
    // «Pan» only shows up in keyframe 2, but the question follows keyframe 1.
    const r = run(m => { story(m).plan.keyframes[0].questions = ['¿Qué come el gato?']; story(m).plan.keyframes[1].questions = []; story(m).text = story(m).text.replace('El gato come pan.', 'El gato come.'); story(m).plan.keyframes[1].text = 'El gato come.'; story(m).plan.keyframes[2].text = 'Ana dice: "Me llamo Ana". Pan.'; story(m).text += ' Pan.'; });
    expect(r.rules.during.status).toBe('error');
    expect(messages(r.rules.during).join()).toMatch(/aparece solo después \(keyframe 3\)/);
  });
  test('a yes/no question is located by its own words (and cannot be proven wrong when they repeat)', () => {
    const r = run(m => { story(m).questions[0].text = '¿Ana dice su nombre?'; story(m).plan.keyframes[0].questions = ['¿Ana dice su nombre?']; }).rules.during;
    expect(r.status).not.toBe('error');
  });
  test('an answer that cannot be located is only a warning', () => {
    const r = run(m => { story(m).questions[1].options = ['Carne', 'Pez']; story(m).questions[1].correct = 'Carne'; }).rules.during;
    expect(r.status).toBe('warning');
    expect(messages(r)[0]).toMatch(/no se pudo verificar/);
  });
  test('a question that is not in the story is an error', () => {
    expect(run(m => { story(m).plan.keyframes[0].questions = ['¿Otra cosa?']; }).rules.during.status).toBe('error');
  });
});

describe('R4 no mandatory final quiz', () => {
  test('0 or 1 question after passes; 2 or more is a warning', () => {
    const q = text => ({ type: 'question', question: text });
    expect(run(m => story(m).plan.after.push(q('¿Ana tiene un gato?'))).rules.after.status).toBe('ok');
    const r = run(m => story(m).plan.after.push(q('¿Ana tiene un gato?'), q('¿Qué come el gato?'))).rules.after;
    expect(r.status).toBe('warning');
    expect(messages(r)[0]).toMatch(/2 preguntas al final/);
  });
});

describe('R5 reappearance', () => {
  test('no later is a warning, except for the last story of the course', () => {
    expect(run(m => { story(m).plan.later = []; }).rules.revisit.status).toBe('warning');
    expect(run(null, 'Tres').rules.revisit.status).toBe('ok');
    expect(run(m => { story(m, 'Tres').plan.later = []; }, 'Tres').rules.revisit.status).toBe('ok');
  });
  test('pointing to an earlier story or to itself is an error', () => {
    const back = run(m => { story(m, 'Dos').plan.later = [{ expression: 'Me llamo', role: 'revisit', storyTitle: 'Uno' }]; }, 'Dos').rules.revisit;
    expect(back.status).toBe('error');
    expect(messages(back)[0]).toMatch(/anterior/);
    const self = run(m => { story(m).plan.later = [{ expression: 'Me llamo', role: 'revisit', storyTitle: 'Uno' }]; }).rules.revisit;
    expect(self.status).toBe('error');
    expect(messages(self)[0]).toMatch(/misma historia/);
  });
  test('an unknown destination is an error', () => {
    expect(run(m => { story(m).plan.later[0].storyTitle = 'Cuatro'; }).rules.revisit.status).toBe('error');
  });
  test('the expression must be in the destination text (error) and declared as revisit in its before (warning)', () => {
    const missing = run(m => { story(m).plan.later[0].expression = 'Gato'; }).rules.revisit;
    expect(missing.status).toBe('error');
    expect(messages(missing).join()).toMatch(/«Gato»: no aparece en el texto de «Dos»/);
    const undeclared = run(m => { story(m, 'Dos').plan.before = story(m, 'Dos').plan.before.filter(b => b.role !== 'revisit'); }).rules.revisit;
    expect(undeclared.status).toBe('warning');
    expect(messages(undeclared)[0]).toMatch(/rol revisit/);
  });
  test('destinations can be referenced by id (stored plans)', () => {
    const r = run(m => { story(m).plan.later = [{ expression: 'Me llamo', role: 'revisit', storyId: 2 }]; }).rules.revisit;
    expect(r.status).toBe('ok');
    expect(run(m => { story(m).plan.later = [{ expression: 'Me llamo', role: 'revisit', storyId: 99 }]; }).rules.revisit.status).toBe('error');
  });
});

describe('R6 vocabulary and encoding', () => {
  test('an expression missing from the course vocabulary is an error', () => {
    const r = run(m => { m.vocabulary = m.vocabulary.filter(v => v.word !== 'Tiene'); }).rules.vocabulary;
    expect(r.status).toBe('error');
    expect(messages(r)[0]).toMatch(/«Tiene» no está en el vocabulario/);
  });
  test('vocabulary lookup ignores case and accents', () => {
    expect(run(m => { m.vocabulary.find(v => v.word === 'Tiene').word = 'TIENÉ'; }).rules.vocabulary.status).toBe('ok');
  });
  test('mojibake in the text, a question or an option is an error', () => {
    for (const mutate of [
      m => { story(m).text = story(m).text.replace('Ana dice', 'Ana d├¡ce'); },
      m => { story(m).questions[0].text = '┬┐Ana tiene un gato?'; },
      m => { story(m).questions[1].options[1] = 'PÃ©z'; }
    ]) {
      const r = run(mutate).rules.vocabulary;
      expect(r.status).toBe('error');
      expect(messages(r).join()).toMatch(/mojibake/);
    }
  });
});

describe('R7 full story and reinforcements', () => {
  test('exactly one full_story is required', () => {
    expect(run(m => { story(m).plan.after = [{ type: 'flashcards' }]; }).rules.reinforcements.status).toBe('error');
    expect(run(m => story(m).plan.after.push({ type: 'full_story' })).rules.reinforcements.status).toBe('error');
  });
  test('no reinforcement is a warning; any of the three is enough', () => {
    expect(run(m => { story(m).plan.after = [{ type: 'full_story' }]; }).rules.reinforcements.status).toBe('warning');
    for (const type of ['flashcards', 'matching', 'listen_repeat']) {
      expect(run(m => { story(m).plan.after = [{ type: 'full_story' }, { type }]; }).rules.reinforcements.status).toBe('ok');
    }
  });
});

describe('summary', () => {
  test('counts errors and warnings and the stories they belong to', () => {
    const { course } = run(m => {
      story(m).plan.after = [{ type: 'flashcards' }]; // error R7
      story(m, 'Dos').plan.later = []; // warning R5
    });
    expect(course.summary).toMatchObject({ stories: 3, errors: 1, warnings: 1, storiesWithErrors: 1, storiesWithWarnings: 1, storiesClean: 1 });
    expect(course.summary.byRule.reinforcements).toEqual({ error: 1, warning: 0, ok: 2 });
    expect(RULES).toHaveLength(7);
  });
});

describe('plan interpretation matches the seeds (seeds/curated/lib/plan.js)', () => {
  const content = {
    course: { id: 1, title: 'Curso' },
    units: [{ id: 1, order: 1, title: 'U1', vocabulary: [{ id: 10, word: 'Me llamo' }, { id: 11, word: 'Gato' }] }],
    stories: [
      { id: 1, unitId: 1, order: 100, title: 'Con plan', text: 'Un gato. Me llamo Ana.', questions: [{ id: 1, text: '¿Un gato?', type: 'yes_no', options: ['Sí', 'No'], correct: 'Sí' }],
        plan: { before: [{ expression: 'Gato' }, { expression: 'Me llamo', role: 'support' }], keyframes: [{ text: 'Un gato.', questionsAfter: ['¿Un gato?'] }, { text: 'Me llamo Ana.' }],
          after: ['full_story', 'matching'], later: [{ expression: 'Gato', story: 'Sin plan' }] } },
      { id: 2, unitId: 1, order: 200, title: 'Sin plan', text: 'El gato come. Otra frase.', questions: [{ id: 2, text: '¿Come?', type: 'yes_no', options: ['Sí', 'No'], correct: 'Sí' }] }
    ]
  };
  const refs = {
    vocabulary: new Map([['me llamo', { id: 10 }], ['gato', { id: 11 }]]),
    stories: new Map([['con plan', { id: 1 }], ['sin plan', { id: 2 }]])
  };

  test.each(content.stories.map(s => [s.title, s]))('%s: same blocks as buildBlocks', (title, spec) => {
    const refsFor = { ...refs, questions: new Map(spec.questions.map(q => [normalizeKey(q.text), { id: q.id, key: q.text, questionText: q.text }])) };
    const { blocks } = buildBlocks({ id: spec.id, title: spec.title, text: spec.text }, spec.plan, refsFor);
    const plan = planFromContent(spec);
    expect(plan.keyframes.map(k => k.text)).toEqual(blocks.filter(b => b.type === 'keyframe').map(b => b.text));
    expect(plan.keyframes.reduce((n, k) => n + k.questions.length, 0)).toBe(blocks.filter(b => b.type === 'question' && b.phase === 'during').length);
    expect(plan.before.map(b => b.role)).toEqual(blocks.filter(b => b.phase === 'before').map(b => b.vocabularyRole));
    expect(plan.later.length).toBe(blocks.filter(b => b.phase === 'later').length);
    expect(plan.after.map(a => a.type)).toEqual(blocks.filter(b => b.phase === 'after').map(b => b.type));
  });

  test('a story without plan is one keyframe, every question after, flashcards and matching', () => {
    const plan = planFromContent(content.stories[1]);
    expect(plan.keyframes).toEqual([{ text: 'El gato come. Otra frase.', questions: [] }]);
    expect(plan.after.map(a => a.type)).toEqual(['full_story', 'question', 'flashcards', 'matching']);
    expect(plan.before).toEqual([]);
  });

  test('fromContent orders by unit and story and audits without throwing', () => {
    const { stories, summary } = auditCourse(fromContent(content));
    expect(stories.map(s => s.title)).toEqual(['Con plan', 'Sin plan']);
    expect(summary.stories).toBe(2);
    // Sin plan: no targets (error) and it is the last story, so no reappearance is required.
    expect(stories[1].rules.find(r => r.key === 'targets').status).toBe('error');
    expect(stories[1].rules.find(r => r.key === 'revisit').status).toBe('ok');
  });
});

describe('stored plans (planFromBlocks)', () => {
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const blocks = [
    { position: 3, type: 'question', phase: 'during', blockKey: uuid(3), contextBlockKey: uuid(2), questionSnapshot: { questionText: '¿Q1?' } },
    { position: 0, type: 'expression', phase: 'before', blockKey: uuid(0), vocabularyId: 7, vocabularyRole: 'revisit' },
    { position: 1, type: 'keyframe', phase: 'during', blockKey: uuid(1), text: 'Uno dos tres.' },
    { position: 2, type: 'keyframe', phase: 'during', blockKey: uuid(2), text: 'Cuatro cinco seis.' },
    { position: 4, type: 'keyframe', phase: 'during', blockKey: uuid(9), text: 'Texto retirado.', active: false },
    { position: 5, type: 'full_story', phase: 'after', blockKey: uuid(5) },
    { position: 6, type: 'question', phase: 'after', blockKey: uuid(6), questionId: 4 },
    { position: 7, type: 'flashcards', phase: 'after', blockKey: uuid(7) },
    { position: 8, type: 'expression', phase: 'later', blockKey: uuid(8), vocabularySnapshot: { word: 'Gato' }, vocabularyRole: 'revisit', revisitStoryId: 5 }
  ];

  test('rebuilds the plan from ordered, active blocks; the question follows its context keyframe', () => {
    const plan = planFromBlocks(blocks, { vocabularyById: new Map([[7, { word: 'Hola' }]]), questionsById: new Map([[4, { questionText: '¿Q2?' }]]) });
    expect(plan.before).toEqual([{ expression: 'Hola', role: 'revisit' }]);
    expect(plan.keyframes).toEqual([{ text: 'Uno dos tres.', questions: [] }, { text: 'Cuatro cinco seis.', questions: ['¿Q1?'] }]);
    expect(plan.after).toEqual([{ type: 'full_story' }, { type: 'question', question: '¿Q2?' }, { type: 'flashcards' }]);
    expect(plan.later).toEqual([{ expression: 'Gato', role: 'revisit', storyId: 5 }]);
  });
});

describe('command line', () => {
  test('argument parsing and local host detection', () => {
    expect(parseArgs([])).toEqual({ source: 'content', json: false, allowRemote: false, course: null });
    expect(parseArgs(['--source', 'db', '--json', '--allow-remote', '--course', '2'])).toEqual({ source: 'db', json: true, allowRemote: true, course: 2 });
    expect(() => parseArgs(['--source', 'xml'])).toThrow(/content o db/);
    expect(() => parseArgs(['--nope'])).toThrow(/desconocido/);
    expect(['localhost', '127.0.0.1', '::1', 'app.localhost'].every(isLocalHost)).toBe(true);
    expect(isLocalHost('viaduct.proxy.rlwy.net')).toBe(false);
  });

  test('--source db refuses a remote host before connecting', () => {
    const run = spawnSync('node', ['src/db/auditTprs.js', '--source', 'db'], { cwd: BACKEND, encoding: 'utf8', env: { ...process.env, DB_HOST: 'db.example.invalid' } });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/no es local/);
  });

  test('--json prints one parseable document (content mode, whatever the current content says)', () => {
    const run = spawnSync('node', ['src/db/auditTprs.js', '--json'], { cwd: BACKEND, encoding: 'utf8' });
    const report = JSON.parse(run.stdout);
    expect(report.source).toBe('content');
    expect(run.status).toBe(report.errors > 0 ? 1 : 0);
    expect(report.audits[0].stories[0].rules).toHaveLength(7);
  });
});
