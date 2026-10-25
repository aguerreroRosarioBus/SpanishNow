import { moneyInputValue, parseMoneyInput } from './money-input';
describe('Importe comercial sin redondear unidades menores',()=>{
 it('acepta coma o punto decimal y conserva centavos exactos',()=>{expect(parseMoneyInput('1000,00','ARS')).toBe(100000);expect(parseMoneyInput('15.01','USD')).toBe(1501);expect(moneyInputValue(1501,'USD')).toBe('15.01');});
 it('respeta monedas con cero y tres decimales',()=>{expect(parseMoneyInput('15','JPY')).toBe(15);expect(parseMoneyInput('15.1','JPY')).toBeNull();expect(parseMoneyInput('1.005','KWD')).toBe(1005);expect(moneyInputValue(1005,'KWD')).toBe('1.005');});
 it('rechaza exceso de precisión, agrupaciones ambiguas, exponentes y enteros inseguros',()=>{for(const t of ['1.001','1.000,00','1e3','-1','0','','9007199254740992'])expect(parseMoneyInput(t,'USD')).toBeNull();});
});
