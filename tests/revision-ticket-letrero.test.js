const { letraRevisionTicket, formatLetreroTicket } = require('../src/utils/comandasNumbers');
const { bumpRevisionTicketOnDoc } = require('../src/utils/revisionTicket');

describe('letrero ticket impresión', () => {
  test('letras: 1=b, 2=c, 3=d, 25=z, 26=aa', () => {
    expect(letraRevisionTicket(0)).toBe('');
    expect(letraRevisionTicket(1)).toBe('b');
    expect(letraRevisionTicket(2)).toBe('c');
    expect(letraRevisionTicket(3)).toBe('d');
    expect(letraRevisionTicket(25)).toBe('z');
    expect(letraRevisionTicket(26)).toBe('aa');
  });

  test('grupo + revisión', () => {
    expect(formatLetreroTicket([
      { numeroComandaDia: 10, revisionTicket: 1 },
      { numeroComandaDia: 11, revisionTicket: 0 },
    ])).toBe('#11+#10b');
    expect(formatLetreroTicket([
      { numeroComandaDia: 10 },
      { numeroComandaDia: 11, revisionTicket: 2 },
    ])).toBe('#11c+#10');
    expect(formatLetreroTicket([
      { numeroComandaDia: 12 },
      { numeroComandaDia: 15 },
      { numeroComandaDia: 13 },
      { numeroComandaDia: 14 },
    ])).toBe('#15+#14+#13+#12');
  });

  test('grupo + números sueltos conserva + y letra', () => {
    const { formatLetreroDesdeNumeros } = require('../src/utils/comandasNumbers');
    expect(formatLetreroDesdeNumeros([10, 11], [
      { numeroComandaDia: 10, revisionTicket: 1 },
    ])).toBe('#11+#10b');
  });

  test('bump incrementa', () => {
    const doc = { revisionTicket: 0 };
    expect(bumpRevisionTicketOnDoc(doc)).toBe(1);
    expect(bumpRevisionTicketOnDoc(doc)).toBe(2);
  });
});
