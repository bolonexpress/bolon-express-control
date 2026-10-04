'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  IconAlejar,
  IconAcercar,
  IconCerrar,
  IconDescargar,
  IconIzquierda,
  IconDerecha,
  IconLupa,
  IconRenovar,
} from '@/components/ui/icons';


/**
 * Visor de fotos de un movimiento (Fase 12B).
 *
 * Por que firma el SERVIDOR y no este componente: las cookies de sesion son
 * `httpOnly`, asi que el cliente de Supabase del navegador no puede leerlas y
 * toda llamada a Supabase desde aqui salia sin token. La firma la hace
 * `app/api/fotos/[movementId]/route.ts`, que si lee esas cookies y decide foto
 * por foto con la misma policy de Storage de siempre. Es un GET de solo lectura,
 * no una Server Action.
 *
 * Lo que decide y por que:
 *
 * - **`<dialog>` nativo**, como `components/ui/dialog.tsx`: aporta el top layer,
 *   el `Escape`, el atrapado de foco y el bloqueo del fondo sin codificarlos.
 * - **Zoom por `width` en vez de `transform: scale()`**: la imagen crece de
 *   verdad, asi que el contenedor `overflow-auto` la desplaza con el gesto
 *   nativo del dedo y con la rueda. Con `transform` el area no creceria y
 *   habria que reimplementar el arrastre a mano, que en Android es donde fallan
 *   estos gestos. Sin librerias: el proyecto no depende de ninguna.
 * - **Pellizco con eventos de puntero**: dos dedos OWNED por el componente. Se
 *   anula el `touchmove` del navegador con un listener no pasivo solo mientras
 *   hay dos dedos, para que no se mueva la pagina mientras se hace zoom.
 * - **Deslizar hacia abajo para cerrar**, solo desde la barra superior y desde
 *   el fondo: en la imagen se deja el gesto al desplazamiento, que es lo que la
 *   persona quiere hacer ahi.
 */

type Foto = { id: string; mime: string };

/** Validez de la URL firmada. 5 minutos: suficiente para mirar y descargar. */
const VALIDEZ_SEGUNDOS = 300;

/** Escala maxima: 4x. Mas alla la foto pixelada no aporta nada. */
const ESCALA_MAXIMA = 4;

const EXTENSION_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const extensionDe = (mime: string): string => EXTENSION_POR_MIME[mime] ?? 'jpg';

/** `movimiento-#000001-2026-10-04.jpg`: el codigo y la fecha, que es como se busca. */
function nombreDeDescarga(codigo: string, fechaIso: string, mime: string): string {
  const dia = fechaIso ? fechaIso.slice(0, 10) : 'sin-fecha';
  return `movimiento-${codigo}-${dia}.${extensionDe(mime)}`;
}

export function PhotoViewer({
  abierto,
  onCerrar,
  movimientoId,
  codigo,
  fecha,
  indiceInicial = 0,
}: {
  abierto: boolean;
  onCerrar: () => void;
  movimientoId: string;
  /** Codigo legible, "#000001": entra en el nombre del archivo. */
  codigo: string;
  /** `created_at` del movimiento: solo para la fecha del nombre. */
  fecha: string;
  indiceInicial?: number;
}) {
  const refDialog = useRef<HTMLDialogElement>(null);
  const refScroll = useRef<HTMLDivElement>(null);
  /** Punteros activos del gesto: id -> {x, y}. Dos = pellizco. */
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const inicioPellizco = useRef({ distancia: 0, escala: 1 });
  const inicioDeslizamiento = useRef<number | null>(null);

  const [fotos, setFotos] = useState<Foto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [indice, setIndice] = useState(indiceInicial);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [escala, setEscala] = useState(1);
  const [caducada, setCaducada] = useState(false);
  /** Hay dos dedos en pantalla: el gesto es un pellizco, no un desplazamiento. */
  const [pellizcando, setPellizcando] = useState(false);

  const foto = fotos[indice];
  const urlActual = foto ? urls[foto.id] : undefined;

  useEffect(() => {
    const nodo = refDialog.current;
    if (!nodo) return;
    if (abierto && !nodo.open) nodo.showModal();
    if (!abierto && nodo.open) nodo.close();
  }, [abierto]);

  /**
   * Carga las filas y firma cada URL, cada vez que se abre. Volver a firmar en
   * cada apertura es el punto: si se guardara la del listing, a los 2 minutos la
   * foto dejaria de verse y el usuario creeria que se borro.
   */
  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      // Diagnostico: que ruta se esta pidiendo. El visor no recibe un
      // `foto.path` suelto (las cookies de sesion son httpOnly y el navegador no
      // puede firmar), pide la ruta del servidor, que si puede.
      console.log('[PhotoViewer] Ruta recibida:', `/api/fotos/${movimientoId}`);

      // La firma la hace el SERVIDOR, no este componente. Las cookies de sesion
      // son httpOnly, asi que el cliente de Supabase del navegador no puede
      // leerlas y toda peticion a Supabase desde aqui sale sin token (401).
      // `/api/fotos/[movementId]` usa el cliente de servidor, que si las lee, y
      // decide foto por foto con la misma policy de siempre.
      const respuesta = await fetch(`/api/fotos/${movimientoId}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!respuesta.ok) {
        console.error('[PhotoViewer] la ruta no firmó las fotos', {
          movimientoId,
          status: respuesta.status,
        });
        setFotos([]);
        setErrorCarga(
          respuesta.status === 401
            ? 'Tu sesión no está vigente. Recarga la página y entra de nuevo.'
            : 'No se pudo cargar la foto. Intenta descargarla o recargar la página.',
        );
        return;
      }

      const cuerpo = (await respuesta.json()) as {
        fotos: { id: string; url: string | null; mime: string }[];
      };
      const lista: Foto[] = cuerpo.fotos.map((f) => ({ id: f.id, mime: f.mime }));
      console.log(
        '[PhotoViewer] Filas recibidas:',
        lista.length,
        cuerpo.fotos.map((f) => f.url ? 'firmada' : 'sin URL'),
      );
      setFotos(lista);

      const conUrl = cuerpo.fotos.filter((f) => f.url !== null) as { id: string; url: string }[];
      setUrls(Object.fromEntries(conUrl.map((f) => [f.id, f.url])));

      if (conUrl.length > 0) {
        console.log('[PhotoViewer] URL firmada:', conUrl[0]!.url);
      }

      if (lista.length > 0 && conUrl.length === 0) {
        setErrorCarga('No se pudo cargar la foto. Intenta descargarla o recargar la página.');
      }
    } catch (error) {
      console.error('[PhotoViewer] fallo inesperado', error);
      setErrorCarga('No se pudieron firmar las fotos. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  }, [movimientoId]);

  // Al abrir: firma desde cero y arranca el reloj de caducidad.
  useEffect(() => {
    if (!abierto) return;
    setIndice(Math.max(0, indiceInicial));
    setEscala(1);
    setCaducada(false);
    void cargar();

    const reloj = setTimeout(() => setCaducada(true), VALIDEZ_SEGUNDOS * 1000);
    return () => clearTimeout(reloj);
  }, [abierto, indiceInicial, cargar]);

  const total = fotos.length;
  const hayVarias = total > 1;

  const irA = useCallback(
    (nuevo: number) => {
      setEscala(1);
      refScroll.current?.scrollTo({ top: 0, left: 0 });
      setIndice(nuevo);
    },
    [],
  );

  const siguiente = useCallback(() => irA((indice + 1) % total), [indice, total, irA]);
  const anterior = useCallback(() => irA((indice - 1 + total) % total), [indice, total, irA]);

  // Flechas del teclado: navegar sin raton es parte del contrato del dialogo.
  useEffect(() => {
    if (!abierto || !hayVarias) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'ArrowRight') siguiente();
      if (evento.key === 'ArrowLeft') anterior();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto, hayVarias, siguiente, anterior]);

  const acercar = useCallback(() => setEscala((e) => Math.min(ESCALA_MAXIMA, e + 0.5)), []);
  const alejar = useCallback(() => setEscala((e) => Math.max(1, e - 0.5)), []);

  // Mientras hay pellizco, el navegador no debe desplazar la pagina por debajo de
  // los dedos. El listener se anade **no pasivo** solo durante ese gesto, y se
  // quita en cuanto termina: fuera de aqui el desplazamiento es nativo.
  useEffect(() => {
    if (!pellizcando) return;
    const evitarScroll = (evento: TouchEvent) => evento.preventDefault();
    document.addEventListener('touchmove', evitarScroll, { passive: false });
    return () => document.removeEventListener('touchmove', evitarScroll);
  }, [pellizcando]);

  const distancia = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  /** Los dos punteros activos del pellizco. `null` si todavia no hay dos. */
  const dosPunteros = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
    const [a, b] = [...punteros.current.values()];
    return a && b ? [a, b] : null;
  };

  const alApuntar = (evento: React.PointerEvent<HTMLDivElement>) => {
    punteros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    const par = dosPunteros();
    if (par) {
      inicioPellizco.current = { distancia: distancia(par[0], par[1]), escala };
      setPellizcando(true);
    }

    // Un dedo en la barra de arriba: candidato a cerrar deslizando.
    if (evento.pointerType === 'touch' && punteros.current.size === 1) {
      inicioDeslizamiento.current = evento.clientY;
    }
  };

  const alMover = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (!punteros.current.has(evento.pointerId)) return;
    punteros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    const par = dosPunteros();
    if (par) {
      const { distancia: previa, escala: escalaInicial } = inicioPellizco.current;
      if (previa > 0) {
        const factor = distancia(par[0], par[1]) / previa;
        setEscala(Math.min(ESCALA_MAXIMA, Math.max(1, escalaInicial * factor)));
      }
      return;
    }

    // Deslizar hacia abajo desde la barra: cierra el visor.
    const inicioY = inicioDeslizamiento.current;
    if (inicioY !== null && evento.pointerType === 'touch') {
      if (evento.clientY - inicioY > 90) onCerrar();
    }
  };

  const alSoltar = (evento: React.PointerEvent<HTMLDivElement>) => {
    punteros.current.delete(evento.pointerId);
    inicioDeslizamiento.current = null;
    if (punteros.current.size < 2) setPellizcando(false);
  };

  const nombreArchivo = foto ? nombreDeDescarga(codigo, fecha, foto.mime) : 'movimiento.jpg';

  return (
    <dialog
      ref={refDialog}
      aria-label={`Foto del movimiento ${codigo}`}
      onCancel={(evento) => {
        evento.preventDefault();
        onCerrar();
      }}
      onClick={(evento) => {
        // El fondo es el propio <dialog>: pinchar fuera de la imagen cierra.
        if (evento.target === refDialog.current) onCerrar();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-marca-fuerte p-0 text-white backdrop:bg-marca-fuerte/85 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[94dvh] sm:w-[min(100vw-3rem,64rem)] sm:rounded-2xl sm:shadow-flotante"
    >
      {/* Barra superior. En movil es tambien el asa de "desliza para cerrar". */}
      <div
        onPointerDown={alApuntar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        className="flex items-center gap-2 border-b border-white/15 px-2 py-2 sm:px-3"
      >
        {/* Asa de arrastre: solo se insinua; el gesto funciona en toda la barra. */}
        <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/40 sm:hidden" />

        <p className="mr-auto min-w-0 pl-1 text-sm font-semibold">
          <span className="block truncate">{codigo}</span>
          {hayVarias ? (
            <span className="block text-xs font-normal text-white/75">
              Foto {indice + 1} de {total}
            </span>
          ) : null}
        </p>

        <button
          type="button"
          onClick={acercar}
          disabled={escala >= ESCALA_MAXIMA}
          aria-label="Acercar"
          className="inline-flex size-11 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15 disabled:opacity-35"
        >
          <IconAcercar size={22} />
        </button>
        <button
          type="button"
          onClick={alejar}
          disabled={escala <= 1}
          aria-label="Alejar"
          className="inline-flex size-11 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15 disabled:opacity-35"
        >
          <IconAlejar size={22} />
        </button>

        {/*
          El boton de descarga aparece **siempre**, tambien sin foto y tambien
          con la imagen rota: si la imagen falla, descargar es justamente la
          salida. Sin URL firmada no hay nada que descargar, asi que en ese caso
          el boton vuelve a firmar y, en cuanto la tiene, se convierte en el
          enlace real.
        */}
        {urlActual ? (
          <a
            href={urlActual}
            download={nombreArchivo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/25"
          >
            <IconDescargar size={20} />
            <span className="hidden sm:inline">Descargar foto</span>
            <span className="sm:hidden">Guardar</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/25 disabled:opacity-60"
          >
            <IconDescargar size={20} />
            <span className="hidden sm:inline">
              {cargando ? 'Preparando…' : 'Descargar foto'}
            </span>
            <span className="sm:hidden">{cargando ? '…' : 'Guardar'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="inline-flex size-11 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15"
        >
          <IconCerrar size={24} />
        </button>
      </div>

      {/* Lienzo. `overflow-auto` es lo que hace funcionar el desplazamiento
          cuando la imagenAmpliada es mas grande que la pantalla. */}
      <div
        ref={refScroll}
        onDoubleClick={() => setEscala((e) => (e > 1 ? 1 : 2.5))}
        className="relative flex h-[calc(100dvh-4.5rem)] touch-pan-x touch-pan-y items-center justify-center overflow-auto p-2 sm:h-[min(78dvh,44rem)]"
      >
        {cargando ? (
          <p role="status" className="text-base">
            Abriendo la foto…
          </p>
        ) : errorCarga ? (
          <div className="space-y-2 px-4 text-center" role="alert">
            <p className="text-base text-white/90">{errorCarga}</p>
            <p className="text-sm text-white/75">
              Si la imagen no carga, intenta descargarla directamente con el botón
              de arriba.
            </p>
          </div>
        ) : total === 0 ? (
          <p className="max-w-sm px-4 text-center text-base text-white/90">
            Este movimiento no tiene fotos.
          </p>
        ) : urlActual ? (
          <div
            onPointerDown={alApuntar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
            style={{ width: `${escala * 100}%`, minWidth: '100%' }}
            className="flex items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlActual}
              alt={`Foto del movimiento ${codigo}`}
              onError={() => {
                // La URL firmada pudo expirar o el archivo no descifrar. Se avisa
                // en consola porque aqui no hay mas que decir: el siguiente paso
                // es volver a firmar, y el boton de arriba ya lo hace.
                console.error('[PhotoViewer] la imagen no se pudo cargar', {
                  fotoId: foto?.id ?? null,
                  url: urlActual,
                });
                setCaducada(true);
              }}
              className="max-h-full w-full cursor-zoom-in object-contain"
            />
          </div>
        ) : (
          <div className="space-y-3 px-4 text-center">
            <p className="text-base text-white/90">
              {caducada
                ? 'La imagen caducó o no se pudo cargar.'
                : 'Esta foto no se pudo firmar.'}
            </p>
            <p className="text-sm text-white/75">
              No se pudo cargar la foto. Intenta descargarla o recargar la página.
            </p>
            <p className="text-sm text-white/75">
              Si la imagen no carga, intenta descargarla directamente con el botón
              de arriba.
            </p>
            <button
              type="button"
              onClick={() => void cargar()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-base font-semibold text-marca-fuerte"
            >
              <IconRenovar size={20} />
              Recargar imagen
            </button>
          </div>
        )}

        {/* Navegacion entre fotos: fuera del lienzo, para no comerse el gesto
            de pellizco ni el desplazamiento de la imagen. */}
        {hayVarias && urlActual ? (
          <>
            <button
              type="button"
              onClick={anterior}
              aria-label="Foto anterior"
              className="absolute left-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-marca-fuerte/70 text-white transition-colors hover:bg-marca-fuerte sm:size-12"
            >
              <IconIzquierda size={24} />
            </button>
            <button
              type="button"
              onClick={siguiente}
              aria-label="Foto siguiente"
              className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-marca-fuerte/70 text-white transition-colors hover:bg-marca-fuerte sm:size-12"
            >
              <IconDerecha size={24} />
            </button>
          </>
        ) : null}
      </div>

      <p className="px-3 pb-2 text-center text-xs text-white/70">
        {escala > 1
          ? 'Desliza la foto para moverla. Pellizca o toca dos veces para ajustar.'
          : 'Pellizca para ampliar · toca dos veces · desliza hacia abajo para cerrar'}
        {urlActual ? ` · ${nombreArchivo}` : ''}
      </p>
    </dialog>
  );
}

/**
 * Miniatura que abre el visor. En el listado no hay imagen (ADR-014: solo el
 * conteo), asi que el boton es lo que da acceso a la foto sin recargar la pagina.
 */
export function BotonFoto({
  movimientoId,
  codigo,
  fecha,
  conteo,
  className = '',
}: {
  movimientoId: string;
  codigo: string;
  fecha: string;
  /** Cuantas fotos tiene. Si es 0 el boton ni se pinta. */
  conteo: number;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  if (conteo < 1) {
    return <span className={`text-texto-tenue ${className}`}>Sin foto</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`${conteo} foto(s): abrir en grande`}
        className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-texto-suave transition-colors hover:bg-marca-lima/25 hover:text-marca ${className}`}
      >
        <IconLupa size={16} />
        <span className="font-semibold tabular-nums">{conteo}</span>
        <span className="sr-only">foto(s) del movimiento {codigo}: abrir en grande</span>
      </button>

      {abierto ? (
        <PhotoViewer
          abierto
          onCerrar={() => setAbierto(false)}
          movimientoId={movimientoId}
          codigo={codigo}
          fecha={fecha}
        />
      ) : null}
    </>
  );
}