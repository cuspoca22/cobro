import { registerDecorator, ValidationOptions } from 'class-validator';

const STORAGE_HOST = 'firebasestorage.googleapis.com';
const MAX_URL_LENGTH = 2000;

/** Solo URLs https de Firebase Storage. Si hay bucket configurado, debe coincidir. */
export function isHttpsImageUrl(value: unknown, allowEmpty = false): boolean {
  if (value === undefined || value === null) return true;
  if (value === '') return allowEmpty;
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.hostname !== STORAGE_HOST) return false;

  const path = decodeURIComponent(url.pathname);
  if (!path.includes('/o/')) return false;

  const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (bucket && !path.includes(`/b/${bucket}/`)) return false;
  return true;
}

export function IsHttpsImageUrl(options?: ValidationOptions & { allowEmpty?: boolean }) {
  const allowEmpty = options?.allowEmpty !== false;

  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHttpsImageUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return isHttpsImageUrl(value, allowEmpty);
        },
        defaultMessage() {
          return 'La imagen debe ser una URL de Firebase Storage';
        },
      },
    });
  };
}
