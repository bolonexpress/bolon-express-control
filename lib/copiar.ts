/**
 * Copiar al portapapeles, tambien en HTTP plano.
 *
 * **El problema.** `navigator.clipboard` es una API de *contexto seguro*: solo
 * existe en HTTPS o `localhost`. En `http://192.168.1.3:3000` —como entra el
 * celular de la tienda— `navigator.clipboard` es `undefined`, asi que
 * `navigator.clipboard.writeText(...)` revienta con `TypeError`. El `try/catch`
 * lo convertia en "no pasa nada": el boton pulsado no cambiaba de texto y nadie
 * se enteraba de que la clave no se habia copiado (ADR-020).
 *
 * **Los tres caminos**, en orden, porque los dos ultimos existen por el mismo
 * motivo que el primero falla:
 *
 *  1. `navigator.clipboard.writeText` — el nativo, con confirmacion real.
 *  2. `document.execCommand('copy')` sobre un `<textarea>` efimero — obsoleto y
 *     con mala fama, pero es lo unico que funciona en un contexto no seguro. Se
 *     hace dentro del gesto del usuario, que es lo que lo hace funcionar.
 *  3. Si tampoco: el llamador dice "cópiala a mano". Por eso los dos sitios que
 *     muestran una clave temporal la pintan con `select-all`.
 *
 * La funcion NO dice "copiado" cuando no copio: devuelve `false` y decide quien.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  if (typeof window === 'undefined' || texto === '') return false;

  // 1) API asincrona. Requiere contexto seguro Y permiso concedido.
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      /* denegado por permisos o por la politica del navegador: se intenta el
         camino siguiente */
    }
  }

  // 2) Camino antiguo. Solo en un contexto no seguro.
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    // `readonly` + `fixed` + fuera de pantalla: sin esto el movil abre el
    // teclado y deja el foco fuera de la pantalla, que es peor que no copiar.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.width = '1px';
    area.style.height = '1px';
    area.style.padding = '0';
    area.style.border = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);

    area.focus();
    area.select();
    area.setSelectionRange(0, texto.length);
    const copiado = document.execCommand('copy');
    document.body.removeChild(area);

    return copiado;
  } catch {
    return false;
  }
}