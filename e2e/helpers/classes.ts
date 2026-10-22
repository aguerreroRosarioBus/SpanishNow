import { spawnSync } from 'child_process';
import * as path from 'path';
import { E2E_DB } from './env';

const backendDir = path.resolve(__dirname, '../../backend');

/**
 * Habilita a un docente para recibir consultas (teacher_class_settings), como lo haría un admin con
 * class_teachers.manage. Todavía no hay pantalla para eso; se escribe en la base E2E con los modelos del backend.
 */
export function enableTeacherForInquiries(email: string): void {
  const script = `
    const { User, TeacherClassSettings } = require('./src/models');
    (async () => {
      const user = await User.findOne({ where: { email: process.env.TEACHER_EMAIL } });
      if (!user) throw new Error('No existe el docente');
      await TeacherClassSettings.upsert({ userId: user.id, classesEnabledAt: new Date(), acceptsInquiries: true });
      process.exit(0);
    })().catch(e => { console.error(e); process.exit(1); });`;
  const run = spawnSync('node', ['-e', script], {
    cwd: backendDir, encoding: 'utf8', env: { ...process.env, DB_NAME: E2E_DB, DB_HOST: 'localhost', NODE_ENV: 'test', TEACHER_EMAIL: email }
  });
  if (run.status !== 0) throw new Error(`No se pudo habilitar al docente:\n${run.stdout}\n${run.stderr}`);
}
