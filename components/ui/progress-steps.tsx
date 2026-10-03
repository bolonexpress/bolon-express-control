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
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-base font-bold text-texto">
          Paso {actual + 1} de {total}
        </p>
        <p className="text-sm text-texto-suave">{pasos[actual]}</p>
      </div>

      {/* Barra: puramente decorativa, el estado ya lo dan los textos de arriba. */}
      <div
        aria-hidden="true"
        className="h-2 overflow-hidden rounded-full bg-borde"
      >
        <div
          className="h-full rounded-full bg-marca transition-[width] duration-300"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      <ol className="flex flex-wrap gap-x-4 gap-y-2">
        {pasos.map((paso, indice) => {
          const estado = indice < actual ? 'hecho' : indice === actual ? 'actual' : 'pendiente';
          return (
            <li
              key={paso}
              aria-current={estado === 'actual' ? 'step' : undefined}
              className={`flex items-center gap-2 text-sm ${
                estado === 'actual'
                  ? 'font-bold text-texto'
                  : estado === 'hecho'
                    ? 'font-medium text-marca'
                    : 'text-texto-tenue'
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex size-[32px] items-center justify-center rounded-full text-xs font-bold ${
                  estado === 'pendiente'
                    ? 'bg-borde text-texto-suave'
                    : 'bg-marca text-white'
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