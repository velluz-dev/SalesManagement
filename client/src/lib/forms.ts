import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, errorMessage } from './api';

export function applyServerErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>): string {
  if (e instanceof ApiError) {
    const fields = e.fieldErrors;
    for (const [path, message] of Object.entries(fields)) setError(path as Path<T>, { message });
    if (Object.keys(fields).length) return 'Please correct the highlighted fields.';
  }
  return errorMessage(e);
}

export function clean<T extends Record<string, unknown>>(v: T): Partial<T> {
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined)) as Partial<T>;
}
