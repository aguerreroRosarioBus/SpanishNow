import { localTimeChoice } from './local-time-choice';
describe('Horario humano para formar grupos',()=>{
 it('resuelve una hora única y conserva el instante',()=>{const r=localTimeChoice('2026-10-22T09:00','America/New_York',50);expect(r.value?.startsAt).toBe('2026-10-22T13:00:00.000Z');expect(r.value?.utcOffset).toBe('-04:00');});
 it('no normaliza una hora inexistente',()=>{const r=localTimeChoice('2027-03-14T02:30','America/New_York',50);expect(r.value).toBeNull();expect(r.failure?.code).toBe('local_time_nonexistent');});
 it('exige elegir entre dos instancias de una hora repetida',()=>{const r=localTimeChoice('2026-11-01T01:30','America/New_York',50);expect(r.failure?.code).toBe('local_time_ambiguous');expect(r.options.map(o=>o.offset)).toEqual(['-04:00','-05:00']);expect(localTimeChoice('2026-11-01T01:30','America/New_York',50,'-05:00','later').value?.startsAt).toBe('2026-11-01T06:30:00.000Z');});
 it('no acepta un desplazamiento incompatible',()=>{expect(localTimeChoice('2026-10-22T09:00','America/New_York',50,'-03:00').failure?.code).toBe('offset_mismatch');});
});
