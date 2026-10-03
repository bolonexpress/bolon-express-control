# Guía de estilo — BOLÓN EXPRESS

Cómo se ve la app y por qué. Pensada para que cualquiera de nós mantenga el mismo
aspecto sin preguntar: los tokens viven en `app/globals.css` y esta guía explica
qué significan y cuándo se usan.

**Para quién es la app:** personas mayores con poca familiaridad digital. Esa es
la restricción que decide casi todo lo de aquí. Cuando una duda sea "textura vs.
elegancia", gana la textura.

---

## 1. El logo es la fuente de verdad

`public/assets/logo.png` (lockup horizontal, 2172×926, fondo transparente) manda
sobre cualquier decisión de color. La paleta salió de ahí, no de un generador.

Solo hay **una** variante, así que la elección de contexto es de **fondo**:

| Contexto | Variante | Por qué |
| --- | --- | --- |
| Barra de navegación (verde oscuro) | `sobre-oscuro` | La tinta del logo es oscura: sobre verde casi negro se perdería. Se monta sobre un panel blanco redondeado (el "chip"). |
| Login, onboarding, estados vacíos | `sobre-claro` | Transparente sobre superficie clara, tal cual. |
| Favicon | `app/icon.png` | Generado desde el logo (recorte del área con tinta sobre un cuadrado verde de marca). A 16px el wordmark no se lee, así que el color de marca es lo que identifica la pestaña. |

```tsx
<BrandLogo altura={26} variante="sobre-oscuro" prioridad />  // barra
<BrandLogo altura={48} prioridad />                          // login
```

El logo se usa con `<img>`, no con `next/image`: el proyecto no depende de
`sharp` y el optimizador lo necesita en producción. Es un PNG estático con
dimensiones conocidas, servido desde `/public`.

---

## 2. Paleta

Colores literales del logo: verde `#006837`, verde medio `#2B8724`, lima
`#85BF3F`, amarillo `#F5E721`, naranja `#FF8C1E`.

### Tokens de marca

| Token | Hex | Rol | Contraste sobre blanco |
| --- | --- | --- | --- |
| `--color-marca` | `#006837` | Acción principal, enlaces, barra del wizard | **6.9:1** |
| `--color-marca-fuerte` | `#004b29` | Fondo de la barra de navegación | 10.3:1 con blanco |
| `--color-marca-medio` | `#2b8724` | Verde secundario, "éxito" de marca | **4.6:1** |
| `--color-marca-lima` | `#85bf3f` | **Solo decorativo**: fondo de destacado, no texto | 2.2:1 |
| `--color-marca-amarillo` | `#f5e721` | **Solo decorativo** | 1.3:1 |
| `--color-marca-naranja` | `#ff8c1e` | Tarjetas de acción del inicio, con texto casi negro encima | 6.8:1 con `--color-texto` |

### Superficies y texto

| Token | Hex | Rol | Contraste |
| --- | --- | --- | --- |
| `--color-fondo` | `#f4f6f1` | Fondo de página (verde muy claro, no gris) | — |
| `--color-superficie` | `#ffffff` | Tarjetas, campos, menús | — |
| `--color-superficie-alterna` | `#f8faf5` | Zonas secundarias dentro de una tarjeta | — |
| `--color-borde` | `#d9e2d3` | Bordes de tarjeta y campo | — |
| `--color-borde-fuerte` | `#b6c4ae` | Borde de control sin rellenar | — |
| `--color-texto` | `#14261c` | Títulos y texto principal (verde muy oscuro, no negro puro) | **15.9:1** |
| `--color-texto-suave` | `#4a5a50` | Texto secundario y descripciones | **7.3:1** |
| `--color-texto-tenue` | `#5f6f64` | Metadatos (nunca texto de formulario) | **5.3:1** |

### Semánticos

Todos cumplen AA como **texto** sobre `--color-superficie`, y van emparejados con
un tono `-suave` para el fondo y un anillo de 1px para el borde (un aviso sin
borde desaparece con luz de lado).

| Token | Hex | Texto | Fondo |
| --- | --- | --- | --- |
| `--color-exito` | `#1f7a34` | **5.4:1** | `--color-exito-suave` `#e8f5ea` |
| `--color-aviso` | `#92400e` | **7.1:1** | `--color-aviso-suave` `#fdf6dc` |
| `--color-peligro` | `#b42318` | **6.6:1** | `--color-peligro-suave` `#fdecea` |
| `--color-info` | `#1c5fa8` | **6.5:1** | `--color-info-suave` `#e8f0fb` |

> **Regla dura:** el texto de un campo o de un botón se mide contra su fondo, no
> contra el de la página. Antes de dar por bueno un par de colores, compruébalo.
> Para el caso raro, el verificador de contraste de las DevTools o
> `npx @axe-core/cli` sobre la app en marcha.

---

## 3. Tipografía

Base **17px** (`--text-base`), que es el piso del rango pedido (17-18) y ya
equivale a un `16px` con un poco de aire. Cada tamaño lleva su interlineado
definido: nada queda en el valor por defecto.

| Token | px | Uso |
| --- | --- | --- |
| `text-xs` | 13 | Solo metadatos (código, fecha). **Nunca** en un formulario. |
| `text-sm` | 15 | Textos auxiliares y pies. |
| `text-base` | 17 | Cuerpo, etiquetas de campo, botones. |
| `text-lg` | 19 | Descripciones de pantalla. |
| `text-xl` | 22 | Título de diálogo. |
| `text-2xl` | 26 | Título de tarjeta. |
| `text-3xl` | 32 | Título de pantalla (`PageHeader`). |
| `text-4xl` | 40 | Cantidades del asistente. |
| `text-5xl` | 48 | Reserved. |

El peso hace el trabajo de jerarquía antes que el tamaño: **700** para lo que se
lee a distancia, **600** para botones y etiquetas, **400** para el cuerpo.

---

## 4. Espaciado: rejilla de 8px

`--spacing: 0.5rem`, así que **el número multiplica por 8**:

| Clase | px |
| --- | --- |
| `p-1` | 8 |
| `p-2` | 16 |
| `p-3` | 24 |
| `p-4` | 32 |
| `gap-2` | 16 |
| `min-h-6` | 48 |
| `min-h-7` | 56 |
| `size-4` | 32 |

> **La trampa del proyecto:** la app venía con rejilla de 4px. Las clases que ya
> existían se han **duplicado** (`p-4` pasó de 16 a 32px) sin tocar el código. Es
> intencional — más aire ayuda a quien no tiene buena puntería — pero no lo
> "corrijas" bajando números. Para medidas exactas usa valores arbitrarios:
> `size-[44px]`, `min-w-[220px]`.

Móvil primero: el patrón es `flex-col` en móvil y `sm:flex-row` cuando hace
falta, no al revés.

---

## 5. Radios y sombras

| Token | Valor | Uso |
| --- | --- | --- |
| `--radius-md` | 8px | Inputs, badges |
| `--radius-lg` | 12px | Botones, menús |
| `--radius-xl` | 16px | Tarjetas, diálogos |
| `--radius-3xl` | 28px | Chips del logo |
| `--shadow-tarjeta` | difusa y corta | Reposo |
| `--shadow-elevada` | media | Navbar, elementos fijos |
| `--shadow-flotante` | marcada | Modales, toasts, acciones del inicio |

Toda tarjeta lleva **borde además de sombra** (`ring-1 ring-borde`): con luz de
tienda, una sombra sola no se ve.

---

## 6. Reglas de componente

### Botones — `components/ui/button.tsx`

- **48px mínimo siempre.** No existe un tamaño "pequeno" para acciones.
- **Icono + texto.** Un botón solo con icono no dice qué hace.
- Variantes: `primario` (verde), `secundario` (contorno), `fantasma` (sin fondo),
  `peligro`, `exito`. Tamaños: `md` 48px, `lg` 56px, `xl` 64px.
- Un verbo por botón: «Guardar la entrada», no «Aceptar».

```tsx
<BotonEnlace href="/movimientos/entrada" icono={<IconRecibir size={22} />}>
  Recibir mercancía
</BotonEnlace>
```

### Campos — `components/ui/field.tsx`

- **Etiqueta siempre visible.** El `placeholder` es una *pista*, nunca el nombre
  del campo: desaparece al escribir y deja el input sin identificar.
- 56px de alto (`inputClass` ya lo trae), borde de 2px.
- El error va **bajo el campo** con `role="alert"` **y** marca el borde con
  `aria-invalid`: el texto para quien lee, el color para quien escanea.

### Tarjetas — `components/ui/card.tsx`

`Card` + `CardCabecera` + `CardCuerpo`. Superficie blanca sobre `--color-fondo`,
con borde.

### Estados vacíos — `components/ui/empty-state.tsx`

Llevan el logo y **siempre** una salida: un vacío sin acción parece un error de
la app. `compacta` para los que van dentro de una tabla.

### Avisos emergentes — `components/ui/toast.tsx`

Regla de la casa: **el mensaje va en lenguaje humano y dice qué hacer**.

- ✅ «Guardado correctamente», «Falta la foto, tócala de nuevo»
- ❌ «HTTP 200», «campo `foto` obligatorio», «Error 500»

Un error **por campo** no se convierte en toast: ese ya está pintado bajo el
control, que es donde el usuario está mirando.

#### Cómo cruza una redirección — `components/ui/toast-consulta.tsx`

Un toast vive en memoria del navegador: cuando la Server Action redirige, se
evapora. Hay tres caminos y cada guardado usa **el menos invasivo**, sin tocar
las Server Actions:

| Camino | Cuándo | Cómo |
| --- | --- | --- |
| **En el sitio** (`useToastDeEstado`) | La acción **no** redirige: devuelve `{ ok: true }` | El formulario lee su propio estado y avisa en el momento. Sin tocar nada más. |
| **Query param** (`ToastDeConsulta`) | La acción **ya** redirigía con `?mensaje=…` | La página destino lee el parametro, avisa y lo borra de la URL con `router.replace` (un F5 no lo repite). |
| **sessionStorage** (`guardarAviso`) | La acción redirige **sin** mensaje y no admite parametro | Se deja el aviso antes de enviar; lo consume el `ToastProvider` del shell, que sobrevive a la navegación. |

**Decisión: query param siempre que la redirección ya lo admita.** Los cuatro
destinos que recibían un banner estático —`/productos`, `/categorias`,
`/unidades` y `/movimientos`— ya/leetcodeaban `?mensaje=`; montar el toast ahí
no tocó ninguna Server Action y Mata el `MensajeBanner` duplicado. Solo el
**cambio de contraseña** usa `sessionStorage`: su acción redirige a `/` sin
mensaje y no tiene dónde ponerlo. Si algún día esa acción acepta un parametro,
migrar al query param y borrar `guardarAviso`.

，**Frases en lenguaje humano** (nunca un código):

| Flujo | Mensaje |
| --- | --- |
| Editar catálogo | «Guardado correctamente. El producto quedó actualizado.» |
| Estado de compra | «Estado actualizado: comprar.» |
| Activar/desactivar | «Guardado correctamente. Queda activo.» |
| Cambio de contraseña | «Tu contraseña quedó actualizada. Ya puedes usarla para entrar.» |
| Anular movimiento | «Movimiento anulado. El inventario volvió a como estaba.» |

### Botones de estado — `components/shopping/estado-buttons.tsx`

Los botones grandes que mueven un pendiente de compra (Tomar / Comprado /
Descartar / A pendiente) son los únicos rellenos sólidos que **no** son verde de
marca. Salían de la paleta cruda de Tailwind; ahora usan los tokens
semánticos, porque «en proceso» es una advertencia y «comprado» es un éxito, no
dos tonos más de la misma familia:

| Estado | Antes (Tailwind) | Ahora (token) | Fondo | Contraste con `text-white` |
| --- | --- | --- | --- | --- |
| `en_proceso` | `amber-500` | `--color-aviso` | `#92400e` | **7.1:1** ✅ AA |
| `comprado` | `emerald-600` | `--color-exito` | `#1f7a34` | **5.4:1** ✅ AA |
| `descartado` | `slate-*` | `--color-superficie` + `--color-borde` | `#ffffff` | texto `--color-texto` 15.9:1 |
| `pendiente` | `slate-*` | `--color-superficie` + `--color-borde` | `#ffffff` | texto `--color-texto` 15.9:1 |

El hover **no** inventa un tono: baja la opacidad del mismo token
(`hover:bg-aviso/90`), así que el contraste solo puede mejorar.

> Los dos relenos pasaron a tokens porque ámbar sobre blanco es 2.1:1 y
> esmeralda 3.3:1: ninguno llegaba a AA **si el texto no fuera blanco**, y el
> botón se lee de un vistazo a contraluz. Con texto blanco los dos superan el
> 4.5:1 con holgura, y quienSolo ve el color distingue igual por el **texto** del
> botón («Tomar», «Comprado»), nunca por el tono solo.

### Botón de ayuda — `components/ui/help-button.tsx`

Uno por pantalla, en `PageHeader` (o en `CatalogHeader`, que es su equivalente
para el catálogo). Explica **esa** pantalla en 2-3 frases: qué se ve, qué se
puede hacer y a dónde ir si algo falta. Modal, no tooltip: un tooltip no se lee
con pantalla táctil.

Cubre **las 20 pantallas** de la app. Las dos cabeceras lo montan distinto:

- `PageHeader` → prop `ayuda` (inicio, movimientos, sus wizards, inventario,
  compras, historial, auditoría).
- `CatalogHeader` → prop `ayuda` (los 9 del catálogo: listado, nuevo y editar
  de productos, categorías y unidades).
- `compras/[id]` y `movimientos/[id]` → `<HelpButton>` suelto, porque su
  cabecera es propia y no pasa por `PageHeader`.

En los tres casos va **a la derecha**: quien no sabe usar la app debe encontrarlo
sin buscar. El texto va en voz de mostrador («un cajón», «pesa», «se perdió»),
nunca en el nombre técnico de la tabla.

### Diálogo — `components/ui/dialog.tsx`

Sobre `<dialog>` nativo: el top layer aporta bloqueo de fondo, `Escape` y
atrapado de foco sin código propio.

### Iconos — `components/ui/icons.tsx`

SVG de 24×24 con trazo, sin dependencias. **El tamaño va en px absolutos**
(`size={22}`), nunca con la escala de espaciado: en una rejilla de 8px,
`size-5` serían 40px y no cabría en un botón de 48px.

---

## 7. Foco y movimiento

- `:focus-visible` global: `outline: 3px solid` + 2px de separación. En las
  superficies oscuras (`data-superficie="oscura"`, la barra) se invierte a blanco.
- Enlace «Saltar al contenido» como primera tabulación de cada página.
- El estado de un control nunca depende solo del color: el texto del error y el
  `aria-current="step"` cuentan la misma historia que el rojo y el verde.
- `prefers-reduced-motion: reduce` desactiva animaciones y transiciones.

---

## 8. Antes de dar por terminado un componente

- [ ] Se lee con elipsis activadas (nada se corta sin puntos suspensivos).
- [ ] Se usa con el teclado: ¿se ve dónde estoy?
- [ ] Contraste AA del texto contra **su** fondo.
- [ ] Se entiende en < 375px sin scroll horizontal.
- [ ] Errores bajo el campo, con `role="alert"`, y algo que hacer.
- [ ] Iconos con `size` en px, nunca con la escala de espaciado.
- [ ] **Ningún color de la paleta cruda de Tailwind** (`slate-*`, `gray-*`,
      `amber-500`, `emerald-600`…): todo color sale de `@theme`.
      Para comprobarlo:
      ```bash
      # debe salir "SIN CLASES DE PALETA DE TAILWIND"
      $files = Get-ChildItem -Path app,components,lib,server,types -Recurse -Include *.tsx,*.ts -File
      $pat = '\b(slate|gray|zinc|neutral|stone|amber|emerald|red|blue|green|yellow|orange|indigo|violet|purple|pink|teal|cyan|sky|rose|lime|fuchsia)-[0-9]{2,3}\b'
      $hits = $files | Select-String -Pattern $pat
      if ($hits) { $hits } else { "SIN CLASES DE PALETA DE TAILWIND" }
      ```
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` en verde.

---

## 9. Estado final de la Fase 9

Todo lo de esta guía está implementado y verificado. Lo que queda forbidden:

- **Colores literales de Tailwind.** Cero. Solo tokens de `@theme`. Los únicos
  `text-white` que sobreviven son sobre rellenos de marca
  (`bg-marca`, `bg-marca-fuerte`, `bg-aviso`, `bg-exito`, `bg-peligro`), y los
  `black/5` / `black/10` son opacidad para estados hover y sombras, no colores.
- **Avisos de éxito que no se ven.** Todo guardado responde con un toast en
  lenguaje humano, cruza la redirección o no.
- **Pantallas sin botón «?».** Ninguna: las 20 lo tienen.

Componentes del sistema de diseño, todos en `components/ui/`:

| Componente | Para qué |
| --- | --- |
| `Button` / `BotonEnlace` / `botonClass` | 48px mínimo, icono + texto, 5 variantes |
| `SubmitButton` | El mismo aspecto con el texto de «guardando» |
| `ToggleActiveButton` | Activar/desactivar con aviso de éxito |
| `Field` / `Checkbox` / `inputClass` / `tarjetaClass` | Etiqueta visible, error bajo el control |
| `Card` | Superficie con borde y sombra |
| `PageHeader` | Título, acciones y botón «?» de pantalla |
| `CatalogHeader` | Igual, para los 9 módulos del catálogo |
| `HelpButton` | El «?» y su modal |
| `Dialog` | Modal nativo (`<dialog>`) |
| `Aviso` / `EstadoVacio` | Vacíos con salida y avisos en línea |
| `ToastProvider` / `useToast` / `useToastDeEstado` | Avisos emergentes |
| `ToastDeConsulta` / `guardarAviso` / `descartarAviso` | Avisos que cruzan una redirección |
| `BarraPasos` / `ProgressSteps` | Los 3 pasos del asistente de movimientos |
| `BrandLogo` | El logo en sus dos variantes de fondo |
| `UserMenu` / `LogoutButton` | Cuenta y «Ver tour de nuevo» |
| `icons` | SVG de 24×24 con trazo, sin dependencias |