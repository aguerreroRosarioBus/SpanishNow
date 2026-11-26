#!/usr/bin/env node
// Genera el audio con voz sintética del curso de prueba (docs/curso-prueba/PLAN.md, decisión 4):
// macOS `say -v Paulina` (es_MX) + ffmpeg -> mp3 mono de bajo bitrate en backend/seeds/content-trial/audio/.
//   un archivo por keyframe:             h<historia>-k<n>.mp3      (el texto del keyframe)
//   un archivo por estructura:           vocab-<slug>.mp3          (la frase de ejemplo, que contiene la estructura)
// Los mp3 se commitean (pesan poco) y los sube la semilla `npm run db:seed:trial`. Solo hace falta correr este script
// cuando cambia un texto: por defecto no regenera los archivos que ya existen.
//   node scripts/trial-audio.js [--force] [--voice Paulina] [--rate 150] [--bitrate 48k]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadTrialContent, keyframeAudioName, vocabularyAudioName } = require('../seeds/trial/lib/content');

function parseArgs(argv) {
  const options = { force: false, voice: 'Paulina', rate: 150, bitrate: '48k' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--voice') options.voice = argv[++i];
    else if (arg === '--rate') options.rate = Number(argv[++i]);
    else if (arg === '--bitrate') options.bitrate = argv[++i];
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (!Number.isFinite(options.rate) || options.rate < 80 || options.rate > 300) throw new Error('--rate debe estar entre 80 y 300 palabras por minuto');
  return options;
}

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command} falló: ${result.error ? result.error.message : result.stderr.trim()}`);
};

// Las comillas angulares de los textos no se leen bien: la voz las deja como pausa con la puntuación que ya tienen.
const spoken = text => text.replace(/[«»]/g, '');

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = loadTrialContent();
  const outDir = path.join(content.dir, 'audio');
  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-audio-'));

  const jobs = [
    ...content.stories.flatMap(story => story.plan.keyframes.map((kf, i) => ({ name: keyframeAudioName(story.number, i + 1), text: kf.text }))),
    ...content.vocabulary.map(v => ({ name: vocabularyAudioName(v.word), text: v.example }))
  ];
  let made = 0, kept = 0;
  try {
    for (const job of jobs) {
      const target = path.join(outDir, job.name);
      if (fs.existsSync(target) && !options.force) { kept++; continue; }
      const aiff = path.join(work, `${path.basename(job.name, '.mp3')}.aiff`);
      run('say', ['-v', options.voice, '-r', String(options.rate), '-o', aiff, '--', spoken(job.text)]);
      // Mono, 22,05 kHz y sin metadatos: voz clara en pocos KB y salida estable entre corridas.
      run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', options.bitrate,
        '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', target]);
      made++;
      console.log(`${job.name}  ${(fs.statSync(target).size / 1024).toFixed(0)} KB`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`${made} generados, ${kept} ya existían (--force los regenera). Carpeta: ${outDir}`);
}

try { main(); } catch (error) { console.error(error.message); process.exit(1); }
