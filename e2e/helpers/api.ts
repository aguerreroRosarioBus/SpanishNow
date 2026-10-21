import { APIRequestContext } from '@playwright/test';
import { API } from './env';
import { teacher } from './accounts';

/** Respuestas correctas por texto de pregunta, leídas como profesor (el alumno nunca las recibe). */
export async function correctAnswersByQuestion(request: APIRequestContext, storyId: number): Promise<Record<string, string>> {
  const login = await request.post(`${API}/auth/login`, { data: teacher });
  const { token } = await login.json();
  const res = await request.get(`${API}/questions/story/${storyId}`, { headers: { Authorization: `Bearer ${token}` } });
  const questions = await res.json() as { questionText: string; correctAnswer: string }[];
  return Object.fromEntries(questions.map(q => [q.questionText, q.correctAnswer]));
}
