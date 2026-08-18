import { addMoney, formatGhs, fromCedis, pesewas, sumMoney, toCedis } from './money';

describe('money', () => {
  it('stores whole pesewas', () => {
    expect(pesewas(1500)).toBe(1500);
    expect(toCedis(pesewas(1500))).toBe(15);
  });

  it('refuses fractional pesewas', () => {
    expect(() => pesewas(12.5)).toThrow(/whole pesewas/);
  });

  it('refuses negative amounts', () => {
    expect(() => pesewas(-1)).toThrow(/negative/);
  });

  it('converts cedis without floating point drift', () => {
    expect(fromCedis(350)).toBe(35_000);
    expect(fromCedis(0.07)).toBe(7);
    expect(fromCedis(19.99)).toBe(1999);
  });

  it('rejects sub-pesewa precision rather than rounding it away', () => {
    expect(() => fromCedis(1.005)).toThrow(/sub-pesewa/);
  });

  it('adds and sums without leaving the integer domain', () => {
    expect(addMoney(pesewas(1), pesewas(2))).toBe(3);
    expect(sumMoney([pesewas(15_000), pesewas(35_000), pesewas(70_000)])).toBe(120_000);
  });

  it('formats the plan prices from the pitch deck', () => {
    expect(formatGhs(fromCedis(150))).toBe('GHS 150.00');
    expect(formatGhs(fromCedis(700))).toBe('GHS 700.00');
  });
});
