'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { errorClass } from '@/components/ui/field';
import { IconAviso, IconCamara, IconCerrar } from '@/components/ui/icons';
import { FOTO_ACEPTADOS } from '@/lib/validation/movements';

/**
 * Campo de foto con vista previa.
 *
 * Fase 9: el boton de la camara es de 56px, la etiqueta esta siempre visible y
 * el error se pinta bajo el control. La vista previa usa `next/image` porque
 * la foto viene de Supabase Storage como URL firmada; ahi si hace falta el
 * optimizador.
 */
export function PhotoInput({
  required,
  maxBytes,
  error,
  onCambia,
}: {
  required: boolean;
  maxBytes: number;
  error?: string | undefined;
  /** Avisa al formulario padre si hay archivo, para el resumen y el bloqueo. */
  onCambia?: (archivo: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const maxMb = maxBytes / (1024 * 1024);

  return (
    <div className="space-y-2">
      <label htmlFor="foto" className="block text-base font-semibold text-texto">
        Foto
        {required ? (
          <span className="ml-2 rounded-lg bg-peligro-suave px-2 py-0.5 text-sm font-bold text-peligro ring-1 ring-peligro/25">
            Obligatoria
          </span>
        ) : (
          <span className="ml-2 text-sm font-normal text-texto-suave">(opcional)</span>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id="foto"
          name="foto"
          type="file"
          accept={FOTO_ACEPTADOS}
          required={required}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (preview) URL.revokeObjectURL(preview);
            setPreview(file ? URL.createObjectURL(file) : null);
            setNombre(file ? file.name : null);
            onCambia?.(file);
          }}
          className="block min-h-7 w-full rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-base text-texto-suave file:mr-3 file:min-h-6 file:rounded-lg file:border-0 file:bg-marca file:px-4 file:text-base file:font-semibold file:text-white aria-invalid:border-peligro sm:max-w-sm"
        />

        {preview ? (
          <div className="relative">
            <Image
              src={preview}
              alt="Vista previa de la foto"
              width={96}
              height={96}
              unoptimized
              className="size-[96px] rounded-xl object-cover ring-1 ring-borde"
            />
            <button
              type="button"
              onClick={() => {
                if (inputRef.current) inputRef.current.value = '';
                if (preview) URL.revokeObjectURL(preview);
                setPreview(null);
                setNombre(null);
                onCambia?.(null);
              }}
              aria-label="Quitar foto"
              className="absolute -right-2 -top-2 inline-flex size-[32px] items-center justify-center rounded-full bg-peligro text-white shadow-elevada"
            >
              <IconCerrar size={20} />
            </button>
          </div>
        ) : null}
      </div>

      {preview ? (
        <p className="flex items-center gap-2 text-base font-medium text-exito">
          <IconCamara size={20} />
          Foto lista: {nombre}
        </p>
      ) : (
        <p className="text-sm text-texto-suave">
          Formato: JPEG, PNG, WebP o HEIC. Hasta {maxMb.toFixed(0)} MB.
        </p>
      )}

      {error ? (
        <p role="alert" className={errorClass}>
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}