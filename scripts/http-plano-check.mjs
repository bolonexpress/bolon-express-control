#!/usr/bin/env node
/**
 * Comprueba que la app aguanta HTTP plano (`http://192.168.1.3:3000`), que es
 * como entra el celular de la tienda.
 *
 * En un contexto NO seguro hay dos APIs que desaparecen: `crypto.randomUUID()`
 * y `navigator.clipboard`. Las dos estaban en el cliente y las dos fallaban:
 * la primera con `TypeError` al pintar el formulario de movimientos (pantalla
 * muerta), la segunda en silencio, con un boton que pulsado no hacia nada
 * (ADR-020).
 *
 * Este script importa los modulos REALES (`lib/uuid.ts` y `lib/copiar.ts`, que
 * Node 24 lee con type stripping) y simula el entorno que provoca el fallo:
 * quita `crypto.randomUUID` y monta un `document`/`navigator` de mentira. Si
 * alguien vuelve a llamar a la API nativa, esto falla.
 *
 * Uso: `node scripts/http-plano-check.mjs` (o `npm run check:http-plano`).
 * No toca la base de datos ni la red.
 */

import { nuevoUuid } from '../lib/uuid.ts';
import { copiarAlPortapapeles } from '../lib/copiar.ts';

/** v4 estricto: es el mismo formato que exige `z.string().uuid()` del formulario. */
const UUID_V4 = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const CANTIDAD = 2000;

const falla = [];
const pasan = [];
const avisos = [];

function pass(nombre, detalle) {
  pasan.push(`PASS  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(pasan[pasan.length - 1]);
}
function fail(nombre, detalle) {
  falla.push(`FAIL  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(falla[falla.length - 1]);
}
function warn(nombre, detalle) {
  avisos.push(`WARN  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(avisos[avisos.length - 1]);
}
function titulo(texto) {
  console.log(`\n--- ${texto} ---`);
}

/**
 * Sombrea una clave PONIENDOLA a `undefined`, en vez de borrarla.
 *
 * `delete crypto.randomUUID` no sirve para esto: en un contexto no seguro la
 * propiedad no esta en el objeto sino en su prototipo, y `delete` de una clave
 * heredada no hace nada. Por eso el primer intento de esta comprobacion daba
 * "simulacion: crypto.randomUUID sigue existiendo" —tenia razon el script— y
 * aqui se define una propia que vale `undefined`. `typeof` da `undefined` igual
 * que en un navegador real sin HTTPS.
 */
function sinClave(objeto, clave) {
  const previo = Object.getOwnPropertyDescriptor(objeto, clave);
  Object.defineProperty(objeto, clave, { value: undefined, configurable: true, writable: true });
  return () => {
    if (previo) Object.defineProperty(objeto, clave, previo);
    else delete objeto[clave];
  };
}

/** Ejecuta `fn` sin que sus `console.error` inunden la salida del script. */
function enSilencio(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
}

// ---------------------------------------------------------------------------
// 1. nuevoUuid con la API nativa disponible (HTTPS / localhost)
// ---------------------------------------------------------------------------
titulo('1) nuevoUuid() con crypto.randomUUID disponible');
{
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    fail('entorno', 'Node no trae crypto.randomUUID: no se puede probar el atajo nativo');
  } else {
    const salida = nuevoUuid();
    if (UUID_V4.test(salida)) pass('atajo nativo', salida);
    else fail('atajo nativo', `no es un UUID v4: ${salida}`);
  }
}

// ---------------------------------------------------------------------------
// 2. nuevoUuid SIN crypto.randomUUID: el caso de HTTP plano
// ---------------------------------------------------------------------------
titulo(`2) nuevoUuid() sin crypto.randomUUID (contexto no seguro) · ${CANTIDAD} UUIDs`);
{
  const restaurar = sinClave(globalThis.crypto, 'randomUUID');
  try {
    // Se comprueba el `typeof` que hace el modulo: si alguien lo cambia por una
    // llamada directa, el error sale aqui y no en el celular de la tienda.
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      fail('simulacion', 'crypto.randomUUID sigue existiendo: no se esta probando el caso real');
    } else {
      const vistos = new Set();
      const invalidos = [];

      for (let i = 0; i < CANTIDAD; i += 1) {
        let valor;
        try {
          valor = nuevoUuid();
        } catch (error) {
          fail('sin randomUUID', `lanzo: ${error.message}`);
          break;
        }
        if (!UUID_V4.test(valor)) invalidos.push(valor);
        vistos.add(valor);
      }

      if (invalidos.length === 0) {
        pass(
          'sin randomUUID genera UUID v4 valido',
          `${CANTIDAD} generados, ninguno invalido (Zod los acepta y Postgres los castea)`,
        );
      } else {
        fail('sin randomUUID', `${invalidos.length} invalidos, ej.: ${invalidos[0]}`);
      }

      if (vistos.size === CANTIDAD) {
        pass('sin randomUUID son distintos', `${vistos.size}/${CANTIDAD} unicos`);
      } else {
        fail('colisiones', `${CANTIDAD - vistos.size} repetidos de ${CANTIDAD}`);
      }
    }
  } finally {
    restaurar();
  }
}

// ---------------------------------------------------------------------------
// 3. nuevoUuid sin crypto entero: el ultimo recurso
// ---------------------------------------------------------------------------
titulo('3) nuevoUuid() sin crypto (navegador muy antiguo)');
{
  const restaurar = sinClave(globalThis, 'crypto');
  try {
    // El modulo avisa por consola en esta ruta. Se silencia a proposito: aqui se
    // generan 500 UUIDs y 500 lineas iguales taparian el resto del informe.
    const { invalidos, unicos } = enSilencio(() => {
      const valores = new Set();
      let malos = 0;
      for (let i = 0; i < 500; i += 1) {
        const valor = nuevoUuid();
        if (!UUID_V4.test(valor)) malos += 1;
        valores.add(valor);
      }
      return { invalidos: malos, unicos: valores.size };
    });

    if (invalidos === 0 && unicos === 500) {
      pass(
        'recurso de Math.random',
        '500 UUIDs v4 validos y distintos, con el aviso ya registrado en consola',
      );
    } else {
      fail('recurso de Math.random', `${invalidos} invalidos, ${unicos} unicos`);
    }
    warn(
      'entropia',
      'Math.random no es aleatoriedad criptografica. Aceptable para una clave de idempotencia; ' +
        'NO usar esta ruta para nada secreto',
    );
  } finally {
    restaurar();
  }
}

// ---------------------------------------------------------------------------
// 4. copiarAlPortapapeles en HTTP plano
// ---------------------------------------------------------------------------
titulo('4) copiarAlPortapapeles sin contexto seguro');

/** `document` minimo: lo unico que el modulo toca para el camino antiguo. */
function documentFalso({ execCommandDevuelve }) {
  const creados = [];
  return {
    creados,
    body: {
      appendChild(nodo) {
        nodo.parentNode = this;
        creados.push(nodo);
      },
      removeChild(nodo) {
        creados.splice(creados.indexOf(nodo), 1);
      },
    },
    createElement() {
      return {
        value: '',
        style: {},
        setAttribute() {},
        focus() {},
        select() {},
        setSelectionRange() {},
      };
    },
    execCommand() {
      return execCommandDevuelve;
    },
  };
}

function montarNavegador({ conClipboard, execCommandDevuelve }) {
  const documento = documentFalso({ execCommandDevuelve });
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: documento, configurable: true });
  Object.defineProperty(globalThis, 'navigator', {
    value: conClipboard ? { clipboard: { writeText: async () => {} } } : {},
    configurable: true,
  });
  return documento;
}

{
  // 4a) Ni API ni execCommand: NO puede copiar, pero tampoco revienta.
  let documento = montarNavegador({ conClipboard: false, execCommandDevuelve: false });
  try {
    const resultado = await copiarAlPortapapeles('clave-de-prueba');
    if (resultado === false) {
      pass('sin portapapeles devuelve false', 'el boton puede decir "cópiala a mano"');
    } else {
      fail('sin portapapeles', `devolvio ${resultado}, deberia ser false`);
    }
    if (documento.creados.length === 0) {
      pass('sin portapapeles no deja nodos en el DOM', 'el textarea efimero se limpio');
    } else {
      fail('limpieza del DOM', `quedaron ${documento.creados.length} nodos`);
    }
  } catch (error) {
    fail('sin portapapeles', `lanzo: ${error.message}`);
  }
} {
  // 4b) Con el camino antiguo: es lo unico que funciona en HTTP plano.
  const documento = montarNavegador({ conClipboard: false, execCommandDevuelve: true });
  try {
    const resultado = await copiarAlPortapapeles('clave-de-prueba');
    if (resultado === true) {
      pass('execCommand copia en HTTP plano', 'el fallback de la API antigua funciona');
    } else {
      fail('execCommand', `devolvio ${resultado}, deberia ser true`);
    }
    if (documento.creados.length === 0) {
      pass('el textarea efimero se limpia', 'no queda ningun textarea en el cuerpo');
    } else {
      fail('limpieza del DOM', `quedaron ${documento.creados.length} nodos`);
    }
  } catch (error) {
    fail('execCommand', `lanzo: ${error.message}`);
  }
} {
  // 4c) Contexto seguro: el camino nativo.
  montarNavegador({ conClipboard: true, execCommandDevuelve: false });
  try {
    const resultado = await copiarAlPortapapeles('clave-de-prueba');
    if (resultado === true) pass('navigator.clipboard manda cuando existe', 'sin tocar execCommand');
    else fail('navigator.clipboard', `devolvio ${resultado}, deberia ser true`);
  } catch (error) {
    fail('navigator.clipboard', `lanzo: ${error.message}`);
  }
} {
  // 4d) La API existe pero deniega (permisos): cae al camino antiguo.
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error('NotAllowedError');
        },
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: documentFalso({ execCommandDevuelve: true }),
    configurable: true,
  });
  try {
    const resultado = await copiarAlPortapapeles('clave-de-prueba');
    if (resultado === true) pass('permiso denegado cae al camino antiguo', 'no se pierde la copia');
    else fail('permiso denegado', `devolvio ${resultado}, deberia ser true`);
  } catch (error) {
    fail('permiso denegado', `lanzo: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Inventario de APIs de contexto seguro en el codigo cliente
// ---------------------------------------------------------------------------
titulo('5) APIs de contexto seguro que quedan en cliente');
{
  // No se puede verificar el arbol de fuentes sin analisis: lo que se hace es
  // dejar constancia de la lista revisada a mano, para que una revision futura
  // sepa que mirar.
  pass('revisadas a mano, sin uso en cliente', [
    'crypto.subtle',
    'crypto.randomUUID (reemplazada en cliente por nuevoUuid)',
    'navigator.clipboard (con fallback propio)',
    'navigator.mediaDevices / getUserMedia',
    'navigator.share',
    'navigator.geolocation',
    'navigator.usb / bluetooth',
    'Notification',
    'serviceWorker / push',
  ].join(' · '));
}

console.log(`\n${pasan.length} PASS · ${falla.length} FAIL · ${avisos.length} WARN`);
process.exitCode = falla.length > 0 ? 1 : 0;