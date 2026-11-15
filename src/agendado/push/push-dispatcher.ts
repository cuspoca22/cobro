export const PUSH_DISPATCHER = Symbol('PUSH_DISPATCHER');

export type PushDispatchResult =
  | { delivered: true }
  | { delivered: false; reason: 'not_configured' | 'no_token' | 'error'; detail?: string };

export interface PushIntent {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

/**
 * Puerto de push. Hoy lo implementa el no-op.
 * Firebase debe sustituir el provider sin cambiar el cron ni el agendado.
 */
export interface PushDispatcher {
  dispatch(intent: PushIntent): Promise<PushDispatchResult>;
}
