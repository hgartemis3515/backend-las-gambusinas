const { letraRevisionTicket, formatLetreroTicket } = require('../src/utils/comandasNumbers');
const { bumpRevisionTicketOnDoc } = require('../src/utils/revisionTicket');

describe('letrero ticket impresión', () => {
  test('letras: 1=a, 2=B, 3=C, 26=Z, 27=AA', () => {
    expect(letraRevisionTicket(0)).toBe('');
    expect(letraRevisionTicket(1)).toBe('a');
    expect(letraRevisionTicket(2)).toBe('B');
    expect(letraRevisionTicket(3)).toBe('C');
    expect(letraRevisionTicket(26)).toBe('Z');
    expect(letraRevisionTicket(27)).toBe('AA');
  });

  test('grupo + revisión', () => {
    expect(formatLetreroTicket([
      { numeroComandaDia: 10, revisionTicket: 1 },
      { numeroComandaDia: 11, revisionTicket: 0 },
    ])).toBe('#11+#10a');
    expect(formatLetreroTicket([
      { numeroComandaDia: 10 },
      { numeroComandaDia: 11, revisionTicket: 2 },
    ])).toBe('#11B+#10');
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
    ])).toBe('#11+#10a');
  });

  test('bump incrementa', () => {
    const doc = { revisionTicket: 0 };
    expect(bumpRevisionTicketOnDoc(doc)).toBe(1);
    expect(bumpRevisionTicketOnDoc(doc)).toBe(2);
  });
});
