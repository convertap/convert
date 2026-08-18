import { advanceStatus, requiresConsent } from './message';

describe('message status', () => {
  it('advances forward', () => {
    expect(advanceStatus('queued', 'sent')).toBe('sent');
    expect(advanceStatus('sent', 'delivered')).toBe('delivered');
    expect(advanceStatus('delivered', 'read')).toBe('read');
  });

  it('ignores a late callback carrying an earlier state', () => {
    expect(advanceStatus('read', 'sent')).toBe('read');
    expect(advanceStatus('delivered', 'queued')).toBe('delivered');
  });

  it('treats a duplicate callback as a no-op', () => {
    expect(advanceStatus('delivered', 'delivered')).toBe('delivered');
  });

  it('makes failure terminal in both directions', () => {
    expect(advanceStatus('sent', 'failed')).toBe('failed');
    expect(advanceStatus('failed', 'read')).toBe('failed');
  });

  it('requires consent only for marketing templates', () => {
    expect(requiresConsent('marketing')).toBe(true);
    expect(requiresConsent('utility')).toBe(false);
    expect(requiresConsent('service')).toBe(false);
  });
});
