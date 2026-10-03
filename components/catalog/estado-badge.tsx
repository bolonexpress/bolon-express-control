/** Estado del registro en el catalogo (soft delete: nunca se borra la fila). */
export function EstadoBadge({ activo }: { activo: boolean }) {
  return activo ? (
    <span className="inline-flex rounded-full bg-exito-suave px-2 py-0.5 text-xs font-medium text-exito">
      Activo
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-superficie-alterna px-2 py-0.5 text-xs font-medium text-texto-suave">
      Inactivo
    </span>
  );
}
