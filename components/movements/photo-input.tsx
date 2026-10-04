'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { errorClass } from '@/components/ui/field';
import { IconAviso, IconCamara, IconCerrar } from '@/components/ui/icons';
import { FOTO_ACEPTADOS } from '@/lib/validation/movements';

/**
 * Vuelve a meter el archivo en un `<input type="file">`.
 *
 * Un input de archivo es el unico control de formulario que el navegador
 * PROHIBE rellenar por script (`input.value = 'ruta'` no existe y por
 * seguridad no se deja). La unica via es reconstruir un `DataTransfer` y
 * asignarlo a `.files`. Es un API de navegador estable, pero se protege con
 * try/catch: si fallara, el formulario sigue siendo utilizable, solo se pierde
 * la foto y el reenvio lo avisa.
 */
function reinyectar(input: HTMLInputElement, archivo: File): boolean {
  try {
    if (typeof DataTransfer === 'undefined') return false;
    const dt = new DataTransfer();
    dt.items.add(archivo);
    input.files = dt.files;
    return input.files?.length === 1;
  } catch {
    return false;
  }
}

/**
 * Campo de foto con vista previa.
 *
 * Fase 9: el boton de la camara es de 56px, la etiqueta esta siempre visible y
 * el error se pinta bajo el control. La vista previa usa `next/image` porque
 * la foto viene de Supabase Storage como URL firmada; ahi si hace falta el
 * optimizador.
 *
 * **La foto sobrevive a un envio fallido** (Fase 11). React resetea el formulario
 * cuando termina una Server Action, y eso vacia el input de archivo: sin esto,
 * la vista previa seguia diciendo "Foto lista: ACEITE.jpg" mientras el segundo
 * envio llegaba sin foto. Peor que perderla era la promesa falsa, porque la foto
 * es obligatoria. Se conserva el `File` en memoria y se reinyecta en cuanto el
 * formulario vuelve a fallar; si eso no fuera posible, el texto lo dice, en vez
 * de seguir enseñando una foto que ya no se va a enviar.
 */
export function PhotoInput({
  required,
  maxBytes,
  error,
  onCambia,
  resultadoEnvio,
}: {
  required: boolean;
  maxBytes: number;
  error?: string | undefined;
  /** Avisa al formulario padre si hay archivo, para el resumen y el bloqueo. */
  onCambia?: (archivo: File | null) => void;
  /**
   * El estado que devuelve la Server Action. Solo se usa para saber CUANDO se
   * reenvio el formulario: cambia de identidad en cada respuesta, y en el
   * exito la pagina redirige, asi que aqui solo se ve el fallo.
   */
  resultadoEnvio?: unknown;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [recuperada, setRecuperada] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // El `File` se guarda aparte del preview: es lo que hay que reinyectar.
  const archivoRef = useRef<File | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Tras un envio fallido el input quedo vacio. Se repone el archivo guardado.
  useEffect(() => {
    if (resultadoEnvio === undefined) return;
    const input = inputRef.current;
    const archivo = archivoRef.current;
    if (!input || !archivo) return;
    if ((input.files?.length ?? 0) > 0) return;

    const repuesta = reinyectar(input, archivo);
    setRecuperada(repuesta);
    if (!repuesta) onCambia?.(null);
  }, [resultadoEnvio, onCambia]);

  const maxMb = maxBytes / (1024 * 1024);

  const olvidar = () => {
    if (inputRef.current) inputRef.current.value = '';
    if (preview) URL.revokeObjectURL(preview);
    archivoRef.current = null;
    setPreview(null);
    setNombre(null);
    setRecuperada(false);
    onCambia?.(null);
  };

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
            archivoRef.current = file;
            setPreview(file ? URL.createObjectURL(file) : null);
            setNombre(file ? file.name : null);
            setRecuperada(false);
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
              onClick={olvidar}
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
          {recuperada ? 'Foto recuperada, se enviará otra vez' : 'Foto lista'}
          {nombre ? `: ${nombre}` : ''}
        </p>
      ) : (
        <p className="text-sm text-texto-suave">
          Formato: JPEG, PNG, WebP o HEIC. Hasta {maxMb.toFixed(0)} MB.
        </p>
      )}

      {!preview && required ? (
        <p className="text-sm text-texto-suave">
          Vuelve a_adjuntar la foto: el navegador no permite guardarla entre intentos.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className={errorClass}>
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}