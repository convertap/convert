import { parsePhone, toE164, toSearchForm } from './phone';

describe('phone normalisation', () => {
  it('normalises a local Ghanaian mobile number to E.164', () => {
    expect(toE164('024 123 4567')).toBe('+233241234567');
  });

  it('accepts the same number written several ways', () => {
    const forms = ['0241234567', '024-123-4567', '+233241234567', '233241234567'];
    const normalised = new Set(forms.map((form) => toE164(form)));
    expect(normalised.size).toBe(1);
  });

  it('gives search the same form as writes, so 024 finds +23324', () => {
    expect(toSearchForm('0241234567')).toBe(toE164('+233241234567'));
  });

  it('reports why a number failed rather than throwing', () => {
    expect(parsePhone('').reason).toBe('empty');
    expect(parsePhone('12').ok).toBe(false);
  });

  it('returns null for an unnormalisable search fragment', () => {
    expect(toSearchForm('024')).toBeNull();
  });
});
