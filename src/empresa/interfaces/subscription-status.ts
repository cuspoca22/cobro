export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  GRACE = 'GRACE',
  OVERDUE = 'OVERDUE',
  SUSPENDED = 'SUSPENDED',
}

export enum AccessSuspendedReason {
  PAYMENT = 'PAYMENT',
  MANUAL = 'MANUAL',
}

export type EmpresaSubscriptionInput = {
  dayOfPay?: number | null;
  isSubscriptionPaid?: boolean | null;
  subscriptionGraceDays?: number | null;
  accessSuspended?: boolean | null;
};

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  dayOfPay: number;
  graceDays: number;
  daysPastDue: number;
  isSubscriptionPaid: boolean;
  accessSuspended: boolean;
};

const DEFAULT_DAY_OF_PAY = 19;
const DEFAULT_GRACE_DAYS = 3;

/**
 * Calcula el estado de suscripción a partir del día de pago y gracia.
 * El bloqueo (SUSPENDED) solo ocurre si accessSuspended=true (manual).
 */
export function computeSubscriptionStatus(
  empresa: EmpresaSubscriptionInput,
  now: Date = new Date(),
): SubscriptionSnapshot {
  const dayOfPay = clampDayOfPay(empresa.dayOfPay ?? DEFAULT_DAY_OF_PAY);
  const graceDays = Math.max(0, empresa.subscriptionGraceDays ?? DEFAULT_GRACE_DAYS);
  const isSubscriptionPaid = empresa.isSubscriptionPaid !== false;
  const accessSuspended = !!empresa.accessSuspended;

  if (accessSuspended) {
    return {
      status: SubscriptionStatus.SUSPENDED,
      dayOfPay,
      graceDays,
      daysPastDue: daysPastDueFrom(dayOfPay, now),
      isSubscriptionPaid,
      accessSuspended: true,
    };
  }

  if (isSubscriptionPaid) {
    return {
      status: SubscriptionStatus.ACTIVE,
      dayOfPay,
      graceDays,
      daysPastDue: 0,
      isSubscriptionPaid: true,
      accessSuspended: false,
    };
  }

  const daysPastDue = daysPastDueFrom(dayOfPay, now);

  if (daysPastDue <= 0) {
    return {
      status: SubscriptionStatus.ACTIVE,
      dayOfPay,
      graceDays,
      daysPastDue: 0,
      isSubscriptionPaid: false,
      accessSuspended: false,
    };
  }

  if (daysPastDue <= graceDays) {
    return {
      status: SubscriptionStatus.GRACE,
      dayOfPay,
      graceDays,
      daysPastDue,
      isSubscriptionPaid: false,
      accessSuspended: false,
    };
  }

  return {
    status: SubscriptionStatus.OVERDUE,
    dayOfPay,
    graceDays,
    daysPastDue,
    isSubscriptionPaid: false,
    accessSuspended: false,
  };
}

function clampDayOfPay(day: number): number {
  if (!Number.isFinite(day)) return DEFAULT_DAY_OF_PAY;
  return Math.min(31, Math.max(1, Math.trunc(day)));
}

/** Días desde el dayOfPay del ciclo actual (0 si aún no llega). */
function daysPastDueFrom(dayOfPay: number, now: Date): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dueDay = Math.min(dayOfPay, lastDay);
  const dueDate = new Date(year, month, dueDay);
  // Normalizar a medianoche local para comparación por día calendario
  const today = new Date(year, month, now.getDate());
  const ms = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
