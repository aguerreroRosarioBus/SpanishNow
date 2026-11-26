// Glosas (tooltips) de cada keyframe del curso de prueba. Mismo contrato que POST /api/tooltips con targetType 'keyframe':
// targetId = id de la historia, blockKey = el del keyframe publicado, offsets relativos al texto de ESE keyframe
// (la primera aparición de cada glosa) y createdBy = el docente dueño del curso.
// Es idempotente: una glosa que se pisa con un tooltip activo del mismo keyframe (el suyo de una corrida anterior o uno
// del docente) no se vuelve a crear. Un keyframe cuyo texto cambió en la app se deja como está.
const { Op } = require('sequelize');
const { glossOffsets } = require('./lib/content');
const { requireRows, publishedKeyframes, matchKeyframes } = require('./lib/rows');

module.exports = {
  name: 'glosses',
  async run({ models, sequelize, log, content }) {
    const { Tooltip } = models;
    const { course, stories } = await requireRows({ models, content });
    let created = 0, present = 0, skipped = 0;

    for (const { spec, row } of stories) {
      const { keyframes } = await publishedKeyframes(models, row.id);
      for (const { number, spec: kf, block, edited } of matchKeyframes(spec, keyframes)) {
        if (!kf.glosses || !kf.glosses.length) continue;
        if (!block) {
          skipped += kf.glosses.length;
          log(`historia «${spec.title}» keyframe ${number}: ${edited ? 'el texto difiere del archivo (¿editado en la app?)' : 'no está publicado'}; glosas omitidas`);
          continue;
        }
        await sequelize.transaction(async transaction => {
          for (const gloss of glossOffsets(block.text, kf.glosses, `«${spec.title}» keyframe ${number}`)) {
            const overlapping = await Tooltip.count({ where: { targetType: 'keyframe', targetId: row.id, blockKey: block.blockKey, isActive: true,
              startOffset: { [Op.lt]: gloss.endOffset }, endOffset: { [Op.gt]: gloss.startOffset } }, transaction });
            if (overlapping) { present++; continue; }
            await Tooltip.create({ targetType: 'keyframe', targetId: row.id, blockKey: block.blockKey, ...gloss, createdBy: course.teacherId, highlightColor: 'yellow' }, { transaction });
            created++;
          }
        });
      }
    }
    log(`glosas: ${created} creadas, ${present} ya existían, ${skipped} omitidas`);
  }
};
