'use client';

import { useFormStatus } from 'react-dom';

import { botonPrimarioClass } from '@/components/ui/field';

/**
 * Estado del boton durante el submit (ARCHITECTURE.md §8: `useFormStatus`).
 * `pendingText` evita el "double tap" tipico en movil: el boton se bloquea y
 * el texto cambia antes de que el servidor responda.
 */
export function SubmitButton({
  children,
  pendingText,
  className = botonPrimarioClass,
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}
