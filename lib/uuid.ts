/**
 * UUID v4 que funciona tambien en HTTP plano.
 *
 * **Por que existe.** `crypto.randomUUID()` solo esta disponible en un
 * *contexto seguro*: HTTPS, o `localhost`. La app se prueba en la tienda
 * entrando por la IP del Wi-Fi (`http://192.168.1.3:3000`), que es HTTP plano, y
 * ahi `crypto.randomUUID` es `undefined`. Como el formulario de movimientos lo
 * llama en el `useState` inicial, no habia forma de Catch: la pantalla se caia
 * con `TypeError` antes de pintar nada (ADR-020).
 *
 * Lo que NO tiene el problema del contexto seguro es `crypto.getRandomValues()`:
 * forma parte de la interfaz `Crypto` basica y existe en HTTP plano. Asi que el
 * camino normal es ese y `randomUUID()` queda como atajo cuando esta disponible.
 *
 * **El ultimo recurso con `Math.random` es deliberado.** Una clave de
 * idempotencia no es un secreto: no se envia a nadie, no autentica y no protege
 * nada. Lo que necesita es que dos movimientos distintos no compartan clave, y
 * para eso el azar basta. Ponerlo evita que una pantalla se quede en blanco en
 * un navegador sin `crypto`; si alguna vez esto se usa para algo secreto, hay
 * que quitarlo.
 */

/** Devuelve un UUID v4 como texto. Lanza si el entorno no puede generarlo. */
export function nuevoUuid(): string {
  const webCrypto = globalThis.crypto;

  // Atajo: el nativo, cuando existe (todos los navegadores en HTTPS/localhost).
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));

    // Version 4 (bits 12-15 del tercer grupo) y variante RFC 4122 (bits 6-7 del
    // cuarto grupo a `10`). Sin esto el texto es un UUID de forma correcta pero
    // Zod lo rechaza y Postgres no lo castea a `uuid`.
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;

    const hex: string[] = [];
    for (const byte of bytes) hex.push(byte.toString(16).padStart(2, '0'));

    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  }

  // Sin `crypto` en absoluto. Se preferse que la pantalla siga viva.
  console.error('[uuid] el entorno no tiene crypto: se usa Math.random para el UUID');
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (caracter) => {
    const rand = Math.floor(Math.random() * 16);
    const valor = caracter === 'x' ? rand : (rand & 0x3) | 0x8;
    return valor.toString(16);
  });
}