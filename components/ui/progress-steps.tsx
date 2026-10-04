/**
 * Barra de progreso por pasos.
 *
 * Un flujo guiado solo se entiende si se ve cuanto falta: por eso el paso
 * actual va marcado con `aria-current="step"` y con un punto de color, no solo
 * con un numero. El texto se lee solo (no depende del color) para que tambien
 * funcione con daltonismo o con la pantalla en grayscale.
 */

export function BarraPasos({
  pasos,
  actual,
}: {
  /** Títulos cortos: "Producto", "Cantidad", "Confirmar". */
  pasos: readonly string[];
  /** Índice 0-based del paso visible. */
  actual: number;
}) {
  const total = pasos.length;
  const porcentaje = Math.round(((actual + 1) / total) * 100);

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-bold text-texto sm:text-base">
          Paso {actual + 1} de {total}
        </p>
        <p className="text-xs text-texto-suave sm:text-sm">{pasos[actual]}</p>
      </div>

      {/* Barra: puramente decorativa, el estado ya lo dan los textos de arriba.
          En movil es de 6px en vez de 16px: cabe el triple de pasos sin que el
          flujo se vaya hacia abajo. */}
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-borde sm:h-2">
        <div
          className="h-full rounded-full bg-marca transition-[width] duration-300"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      <ol className="flex flex-wrap gap-x-3 gap-y-1.5 sm:gap-x-4 sm:gap-y-2">
        {pasos.map((paso, indice) => {
          const estado = indice < actual ? 'hecho' : indice === actual ? 'actual' : 'pendiente';
          return (
            <li
              key={paso}
              aria-current={estado === 'actual' ? 'step' : undefined}
              className={`flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm ${
                estado === 'actual'
                  ? 'font-bold text-texto'
                  : estado === 'hecho'
                    ? 'font-medium text-marca'
                    : 'text-texto-tenue'
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex size-[26px] items-center justify-center rounded-full text-[11px] font-bold sm:size-[32px] sm:text-xs ${
                  estado === 'pendiente' ? 'bg-borde text-texto-suave' : 'bg-marca text-white'
                }`}
              >
                {indice + 1}
              </span>
              <span className={estado === 'pendiente' ? 'line-through decoration-1' : ''}>
                {paso}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}