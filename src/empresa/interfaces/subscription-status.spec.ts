import {
  AccessSuspendedReason,
  computeSubscriptionStatus,
  SubscriptionStatus,
} from './subscription-status';

describe('computeSubscriptionStatus', () => {
  const base = {
    dayOfPay: 10,
    isSubscriptionPaid: false,
    subscriptionGraceDays: 3,
    accessSuspended: false,
  };

  it('ACTIVE when paid', () => {
    const snap = computeSubscriptionStatus(
      { ...base, isSubscriptionPaid: true },
      new Date(2026, 6, 22),
    );
    expect(snap.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('ACTIVE before dayOfPay', () => {
    const snap = computeSubscriptionStatus(base, new Date(2026, 6, 5));
    expect(snap.status).toBe(SubscriptionStatus.ACTIVE);
    expect(snap.daysPastDue).toBe(0);
  });

  it('GRACE within grace window', () => {
    const snap = computeSubscriptionStatus(base, new Date(2026, 6, 12));
    expect(snap.status).toBe(SubscriptionStatus.GRACE);
    expect(snap.daysPastDue).toBe(2);
  });

  it('OVERDUE after grace', () => {
    const snap = computeSubscriptionStatus(base, new Date(2026, 6, 15));
    expect(snap.status).toBe(SubscriptionStatus.OVERDUE);
    expect(snap.daysPastDue).toBe(5);
  });

  it('SUSPENDED overrides calendar', () => {
    const snap = computeSubscriptionStatus(
      { ...base, accessSuspended: true },
      new Date(2026, 6, 5),
    );
    expect(snap.status).toBe(SubscriptionStatus.SUSPENDED);
  });

  it('exports AccessSuspendedReason', () => {
    expect(AccessSuspendedReason.PAYMENT).toBe('PAYMENT');
  });
});
