import { Pipe, PipeTransform } from '@angular/core';

/** Cuenta con su sustantivo en singular o plural: `2 | plural:'pregunta':'preguntas':'Sin preguntas'`. */
export function pluralize(count: number, one: string, many: string, zero?: string): string {
  if (count === 0 && zero) return zero;
  return `${count} ${count === 1 ? one : many}`;
}

@Pipe({ name: 'plural', standalone: true })
export class PluralPipe implements PipeTransform {
  transform(count: number | null | undefined, one: string, many: string, zero?: string): string {
    return pluralize(count ?? 0, one, many, zero);
  }
}
