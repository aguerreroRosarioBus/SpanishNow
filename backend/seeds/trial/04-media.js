// Audio con voz sintética, ilustraciones y práctica de «escuchar y repetir» del curso de prueba.
//
// Los archivos se generan aparte (scripts/trial-audio.js para el audio; las ilustraciones las entrega W27) y viven en
// seeds/content-trial/audio y seeds/content-trial/images. Esta semilla los SUBE con el mismo mecanismo que la app
// (src/config/cloudinary.js: con MEDIA_FAKE_UPLOADS=1 va a uploads-dev, si no a Cloudinary) y asigna la URL SOLO donde
// el campo está vacío; nunca pisa lo que un docente puso. Volver a correrla cuando llegan las imágenes las agrega.
//
// Por qué se escribe en la revisión publicada y no se crea una revisión nueva: agregar un audio o una imagen donde no había
// no cambia qué enseña la lección (mismos bloques, textos, preguntas y claves), solo la completa. Los alumnos que ya la
// abrieron la ven con el medio nuevo y su progreso no se altera. Un keyframe cuyo texto difiere del archivo (editado en la
// app) no se toca.
//   keyframe:      h<historia>-k<n>.mp3 -> lesson_blocks.audioUrl · images/h<historia>-k<n>.png|webp (+ alt.json) -> imageUrl, imageAlt
//   estructura:    vocab-<slug>.mp3 -> vocabulary.audioUrl (tarjetas) y la instantánea del vocabulario de la revisión publicada
//   portada:       images/h1-k1.png|webp -> courses.imageUrl (la primera ilustración, solo si el curso no tiene portada)
//   escuchar y repetir: usa repetition_activities (frase + audio por historia), no el vocabulario: se crea una actividad por
//                  estructura objetivo de la historia, con su frase de ejemplo y el mismo audio. Solo si la historia no tiene ninguna.
const fs = require('fs');
const path = require('path');
const { normalizeKey } = require('../curated/lib/content');
const { requireRows, publishedKeyframes, matchKeyframes } = require('./lib/rows');
const { keyframeAudioName, vocabularyAudioName, keyframeKey, IMAGE_EXTENSIONS } = require('./lib/content');

const MAX_URL = 500; // largo de las columnas audioUrl / imageUrl

function readOptional(file) {
  try { return fs.readFileSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Sube un archivo y devuelve la URL; lanza si el proveedor no devuelve una URL válida. */
async function upload(cloudinary, buffer, options) {
  const result = await cloudinary.uploadFromBuffer(buffer, options);
  const url = result && result.secure_url;
  if (typeof url !== 'string' || !url || url.length > MAX_URL) throw new Error('la subida no devolvió una URL válida');
  return url;
}

module.exports = {
  name: 'media',
  async run({ models, sequelize, log, content }) {
    const { LessonBlock, LessonPlan, RepetitionActivity } = models;
    const cloudinary = require('../../src/config/cloudinary');
    const audioDir = path.join(content.dir, 'audio');
    const imagesDir = path.join(content.dir, 'images');
    const { course, stories, vocabulary } = await requireRows({ models, content });

    const audioPath = name => path.join(audioDir, name);
    const imageFor = key => IMAGE_EXTENSIONS.map(ext => path.join(imagesDir, `${key}${ext}`)).find(file => fs.existsSync(file));
    const altFile = readOptional(path.join(imagesDir, 'alt.json'));
    const alt = altFile ? JSON.parse(altFile.toString('utf8')) : {};

    const audioFiles = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')) : [];
    const imageCount = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).filter(f => IMAGE_EXTENSIONS.some(e => f.endsWith(e))).length : 0;
    const canUpload = cloudinary.canUpload();
    if (!canUpload && (audioFiles.length || imageCount)) {
      log('aviso: no hay dónde subir archivos (definí MEDIA_FAKE_UPLOADS=1 en local o las variables de Cloudinary); se sigue sin audio ni imágenes');
    }
    if (!audioFiles.length) log('no hay audios en seeds/content-trial/audio (se generan con scripts/trial-audio.js); se sigue sin audio');
    if (!imageCount) log('no hay ilustraciones en seeds/content-trial/images todavía (llegan con W27); se omiten');

    const counts = { cover: 0, keyframeAudio: 0, keyframeImages: 0, vocabularyAudio: 0, activities: 0, activityAudio: 0, skippedEdited: 0 };

    // --- Estructuras del vocabulario (tarjetas): primero, porque «escuchar y repetir» reutiliza esos audios.
    const publishedPlanIds = (await LessonPlan.findAll({ where: { status: 'published', storyId: stories.map(s => s.row.id) }, attributes: ['id'] })).map(p => p.id);
    for (const v of content.vocabulary) {
      const row = vocabulary.get(normalizeKey(v.word));
      const buffer = canUpload && !row.audioUrl ? readOptional(audioPath(vocabularyAudioName(v.word))) : null;
      if (buffer) {
        const audioUrl = await upload(cloudinary, buffer, { folder: 'spanishnow/trial/audio', resource_type: 'video' });
        await row.update({ audioUrl });
        counts.vocabularyAudio++;
      }
      // La lección muestra la instantánea del vocabulario de la revisión publicada: se completa con el mismo audio.
      if (row.audioUrl) {
        const blocks = await LessonBlock.findAll({ where: { planId: publishedPlanIds, type: 'expression', vocabularyId: row.id } });
        for (const block of blocks) {
          if (block.vocabularySnapshot && !block.vocabularySnapshot.audioUrl) await block.update({ vocabularySnapshot: { ...block.vocabularySnapshot, audioUrl: row.audioUrl } });
        }
      }
    }

    // --- Keyframes: audio e ilustración en la revisión publicada vigente.
    for (const { spec, row } of stories) {
      const { keyframes } = await publishedKeyframes(models, row.id);
      for (const { number, block, edited } of matchKeyframes(spec, keyframes)) {
        if (edited) { counts.skippedEdited++; log(`historia «${spec.title}» keyframe ${number}: el texto difiere del archivo (¿editado en la app?); sin audio ni imagen`); continue; }
        if (!block || !canUpload) continue;
        const patch = {};
        if (!block.audioUrl) {
          const buffer = readOptional(audioPath(keyframeAudioName(spec.number, number)));
          if (buffer) patch.audioUrl = await upload(cloudinary, buffer, { folder: 'spanishnow/keyframes', resource_type: 'video' });
        }
        const key = keyframeKey(spec.number, number);
        const imageFile = !block.imageUrl && imageFor(key);
        if (imageFile) {
          patch.imageUrl = await upload(cloudinary, fs.readFileSync(imageFile), { folder: 'spanishnow/keyframes/images', resource_type: 'image' });
          if (!block.imageAlt && typeof alt[key] === 'string' && alt[key].trim()) patch.imageAlt = alt[key].trim().slice(0, 300);
          else if (!block.imageAlt) log(`aviso: la ilustración ${key} no tiene texto alternativo en images/alt.json`);
        }
        if (patch.audioUrl || patch.imageUrl) {
          await block.update(patch);
          if (patch.audioUrl) counts.keyframeAudio++;
          if (patch.imageUrl) counts.keyframeImages++;
        }
      }
    }

    // --- Portada del curso: la primera ilustración de la primera historia, si el docente no puso otra.
    const coverFile = canUpload && !course.imageUrl && imageFor(keyframeKey(1, 1));
    if (coverFile) {
      await course.update({ imageUrl: await upload(cloudinary, fs.readFileSync(coverFile), { folder: 'spanishnow/courses', resource_type: 'image' }) });
      counts.cover++;
    }

    // --- «Escuchar y repetir»: una actividad por estructura objetivo, con la frase de ejemplo y el audio de la estructura.
    for (const { spec, row } of stories) {
      if (!spec.plan.after.includes('listen_repeat')) continue;
      const phrases = (spec.plan.before || []).filter(b => (b.role || 'target') === 'target')
        .map(b => content.vocabulary.find(v => normalizeKey(v.word) === normalizeKey(b.expression)));
      const existing = await RepetitionActivity.findAll({ where: { storyId: row.id }, order: [['order', 'ASC']] });
      await sequelize.transaction(async transaction => {
        if (!existing.length) {
          for (const [order, v] of phrases.entries()) {
            await RepetitionActivity.create({ storyId: row.id, phrase: v.example, audioUrl: vocabulary.get(normalizeKey(v.word)).audioUrl || null, order }, { transaction });
            counts.activities++;
          }
        } else {
          for (const v of phrases) { // completa el audio de una actividad nuestra que se creó antes de tener audio
            const activity = existing.find(a => normalizeKey(a.phrase) === normalizeKey(v.example));
            const audioUrl = vocabulary.get(normalizeKey(v.word)).audioUrl;
            if (activity && !activity.audioUrl && audioUrl) { await activity.update({ audioUrl }, { transaction }); counts.activityAudio++; }
          }
        }
      });
    }

    log(`portada: ${counts.cover ? 'asignada' : 'sin cambios'}; audio de keyframes: ${counts.keyframeAudio}; ilustraciones: ${counts.keyframeImages}; audio de estructuras: ${counts.vocabularyAudio}; ` +
      `actividades de escuchar y repetir: ${counts.activities} creadas, ${counts.activityAudio} con audio completado${counts.skippedEdited ? `; keyframes editados omitidos: ${counts.skippedEdited}` : ''}`);
  }
};
