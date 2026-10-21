import * as fs from 'fs';
import * as path from 'path';

interface Account { email: string; name: string; role: 'teacher' | 'student' }
const file = path.resolve(__dirname, '../../backend/seeds/local-test-accounts.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { password: string; accounts: Account[] };

const find = (role: Account['role']) => {
  const account = data.accounts.find(a => a.role === role);
  if (!account) throw new Error(`No hay cuenta ${role} en local-test-accounts.json`);
  return { email: account.email, password: data.password };
};

/** Credenciales de prueba, leídas de backend/seeds/local-test-accounts.json (nunca hardcodeadas). */
export const teacher = find('teacher');
export const student = find('student');
