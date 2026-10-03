'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  IconCheckCirculo,
  IconCerrar,
  IconInfo,
  IconXCirculo,
  IconAviso as IconAvisoTriangulo,
} from '@/components/ui/icons';
import { ToastDeAvisoPendiente } from '@/components/ui/toast-consulta';

/**
 * Avisos emergentes.
 *
 * Regla de la Fase 9: el mensaje va en lenguaje humano y dice que hacer, no que
 * paso por dentro. "Falta la foto, tocala de nuevo" y no "campo `foto`
 * obligatorio"; "Guardado correctamente" y no "HTTP 200". Quien usa esta app
 * no deberia tener que traducir un codigo de error.
 *
 * Se montan una sola vez por shell (el `Toaster` va en el layout) y se disparan
 * con `useToast()` o con `useToastDeEstado()` cuando una Server Action responde.
 */

type Tono = 'exito' | 'error' | 'aviso' | 'info';

type Aviso = {
  id: number;
  tono: Tono;
  mensaje: string;
  detalle?: string | undefined;
};

type Entrada = { mensaje: string; detalle?: string; tono?: Tono };

type ContextoToast = {
  /** Dispara un aviso. `tono` por defecto `info`. */
  avisar: (entrada: Entrada) => void;
  exito: (mensaje: string, detalle?: string) => void;
  error: (mensaje: string, detalle?: string) => void;
  /** Cierra todos los avisos (util al cambiar de pantalla). */
  limpiar: () => void;
};

const Contexto = createContext<ContextoToast | null>(null);

const DURACION = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(1);
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const cerrar = useCallback((id: number) => {
    setAvisos((previos) => previos.filter((aviso) => aviso.id !== id));
    const temporizador = temporizadores.current.get(id);
    if (temporizador) {
      clearTimeout(temporizador);
      temporizadores.current.delete(id);
    }
  }, []);

  const avisar = useCallback(
    ({ mensaje, detalle, tono = 'info' }: Entrada) => {
      const id = siguienteId.current++;
      setAvisos((previos) => [...previos.slice(-2), { id, tono, mensaje, detalle }]);
      temporizadores.current.set(
        id,
        setTimeout(() => cerrar(id), DURACION),
      );
    },
    [cerrar],
  );

  const valor = useMemo<ContextoToast>(
    () => ({
      avisar,
      exito: (mensaje, detalle) => avisar({ mensaje, detalle, tono: 'exito' }),
      error: (mensaje, detalle) => avisar({ mensaje, detalle, tono: 'error' }),
      limpiar: () => setAvisos([]),
    }),
    [avisar],
  );

  // Limpieza al desmontar: un toast pendiente no puede dejar un setTimeout vivo.
  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => {
      pendientes.forEach((temporizador) => clearTimeout(temporizador));
      pendientes.clear();
    };
  }, []);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* Avisos que viajan en un redirect: se muestran al cambiar de pantalla. */}
      <ToastDeAvisoPendiente />
      <Toaster avisos={avisos} onCerrar={cerrar} />
    </Contexto.Provider>
  );
}

function useToastInterno(): ContextoToast {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useToast necesita un <ToastProvider> en el shell.');
  return contexto;
}

export function useToast(): ContextoToast {
  return useToastInterno();
}

/**
 * Traduccion del estado que devuelve una Server Action a un aviso emergente.
 *
 * Se dispara por cambios de identidad del estado (no por render), asi que no
 * repite el aviso al re-renderizar el formulario. Los errores por campo NO se
 * convierten en toast: esos los pinta el propio campo, que es donde el usuario
 * esta mirando.
 */
export function useToastDeEstado(
  estado: { ok: boolean; error?: { message: string } | undefined } | undefined | null,
  opciones: { exito?: string; silenciarValidacion?: boolean } = {},
) {
  const { avisar } = useToastInterno();
  const { exito: textoExito, silenciarValidacion = true } = opciones;
  const previo = useRef<typeof estado>(undefined);

  useEffect(() => {
    if (!estado || estado === previo.current) return;
    previo.current = estado;

    if (estado.ok) {
      if (textoExito) avisar({ mensaje: textoExito, tono: 'exito' });
      return;
    }

    // `validacion` y `modo_control` ya se ven bajo cada campo: un toast
    // adicional solotaparia el banner sin aportar nada.
    const codigo = (estado as { error?: { code?: string } }).error?.code;
    if (silenciarValidacion && (codigo === 'validacion' || codigo === 'modo_control')) return;

    avisar({ mensaje: estado.error?.message ?? 'No se pudo guardar.', tono: 'error' });
  }, [estado, avisar, textoExito, silenciarValidacion]);
}

const ESTILOS: Record<Tono, { caja: string; texto: string; icono: ReactNode }> = {
  exito: {
    caja: 'bg-exito-suave text-exito ring-exito/30',
    texto: 'text-exito',
    icono: <IconCheckCirculo size={26} />,
  },
  error: {
    caja: 'bg-peligro-suave text-peligro ring-peligro/30',
    texto: 'text-peligro',
    icono: <IconXCirculo size={26} />,
  },
  aviso: {
    caja: 'bg-aviso-suave text-aviso ring-aviso/30',
    texto: 'text-aviso',
    icono: <IconAvisoTriangulo size={26} />,
  },
  info: {
    caja: 'bg-info-suave text-info ring-info/30',
    texto: 'text-info',
    icono: <IconInfo size={26} />,
  },
};

function Toaster({ avisos, onCerrar }: { avisos: Aviso[]; onCerrar: (id: number) => void }) {
  if (avisos.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3 sm:items-end sm:p-4"
    >
      {avisos.map((aviso) => {
        const estilos = ESTILOS[aviso.tono];
        return (
          <div
            key={aviso.id}
            role={aviso.tono === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 shadow-flotante ring-1 ${estilos.caja}`}
          >
            <span className="mt-0.5 shrink-0">{estilos.icono}</span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className={`text-base font-bold ${estilos.texto}`}>{aviso.mensaje}</p>
              {aviso.detalle ? (
                <p className="text-base leading-snug text-texto-suave">{aviso.detalle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onCerrar(aviso.id)}
              aria-label="Cerrar aviso"
              className="-mr-1 -mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-xl text-texto-suave transition-colors hover:bg-black/5"
            >
              <IconCerrar size={22} />
            </button>
          </div>
        );
      })}
    </div>
  );
}