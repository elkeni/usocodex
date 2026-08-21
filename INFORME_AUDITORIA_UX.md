# Informe de auditoría UX y funcional de ParadisQuo

**Fecha:** 21 de agosto de 2026  
**Repositorio:** `elkeni/usocodex`  
**Frontend publicado:** `https://appmusica-5c872.web.app`  
**Backend comprobado:** `https://music-backend-tau.vercel.app`

## Estado de implementación

La **Fase 1 — Honestidad y recorridos esenciales** fue implementada el 21 de agosto de 2026:

- Retirados Descargas, Apple Music “próximamente”, estadísticas aleatorias, enlaces ficticios y afirmaciones promocionales no verificables.
- Incorporados Toast, ConfirmDialog y una pantalla segura ante errores inesperados.
- Sustituidos los cuadros nativos en biblioteca y perfil; el feedback de usuario se centralizó.
- Añadidas etiquetas persistentes y navegación semántica en acceso, cabecera, tarjetas, biblioteca, perfil, cola y menús del reproductor.
- Añadidos estados visibles de carga, buffering, error y cola vacía al reproductor.
- Añadidas pruebas de login, búsqueda, reproducción, favoritos, playlists, teclado y feedback; la suite suma diez pruebas correctas.

La auditoría original se conserva debajo como registro de las decisiones que originaron los cambios.

## 1. Resumen ejecutivo

ParadisQuo tiene una base recuperable y bastante funcional: autenticación, onboarding, feed, búsqueda, biblioteca, perfiles, importación y reproducción están implementados, el proyecto compila, el análisis estático pasa y los endpoints críticos del backend responden.

El problema principal no es la ausencia de producto, sino la acumulación de decisiones incompletas y comportamientos de prototipo dentro de una interfaz de producción. Los casos más visibles son una sección de descargas que no hace nada, cifras de reproducciones inventadas y variables en cada render, confirmaciones mediante cuadros nativos del navegador, controles no accesibles por teclado, una importación de YouTube excesivamente dependiente de proxies públicos y una aplicación privada que mantiene varias pantallas pesadas montadas al mismo tiempo.

La recomendación es **no rediseñar todo desde cero**. Conviene estabilizar primero los recorridos esenciales, definir un sistema visual común y dar a cada función una de estas decisiones explícitas: conservar, reparar, redefinir o retirar.

### Estado general

| Área | Estado | Observación |
|---|---|---|
| Construcción y calidad base | Estable | `lint`, prueba unitaria y build pasan. |
| Conexión con backend | Estable en comprobaciones básicas | Metadatos, búsqueda y resolución de audio responden. |
| Autenticación pública | Funcional | Login y registro existen; faltan mejoras de accesibilidad y estados de ayuda. |
| Navegación privada | Funcional con deuda | Varias pantallas permanecen montadas aunque estén ocultas. |
| Reproductor | Funcional pero frágil | Tiene mucha lógica en un único componente y datos simulados visibles. |
| Biblioteca | Funcional con elementos incompletos | Descargas es una función ficticia; creación y borrado usan avisos nativos. |
| Importación | Parcialmente confiable | Spotify tiene un flujo definido; YouTube depende de una larga cadena de fallbacks. |
| Accesibilidad | Insuficiente | Hay estilos de foco, pero numerosos controles son `div`/`span` clicables. |
| Pruebas de experiencia | Crítico | Solo hay una prueba automática y no cubre recorridos reales. |

## 2. Alcance y método

Se revisaron rutas, componentes, estilos, servicios, estados persistidos, configuración de compilación y conexión con el backend. También se contrastó la interfaz pública desplegada. No se inició sesión con credenciales personales ni se modificaron datos reales, por lo que los recorridos privados se evaluaron mediante el código y las comprobaciones técnicas disponibles.

Prioridades usadas:

- **P0 — Bloqueante:** impide completar el recorrido principal o expone un riesgo grave.
- **P1 — Alta:** degrada una función central, la confianza o el uso móvil/accesible.
- **P2 — Media:** produce confusión, inconsistencia o mantenimiento costoso.
- **P3 — Baja:** mejora de pulido que puede esperar.

## 3. Hallazgos visuales y de experiencia

### UX-01 — Controles importantes no son accesibles por teclado (P1)

**Evidencia:** navegación principal en `src/screens/home/index.jsx:37`; cambio login/registro en `src/screens/auth/login.jsx:157` y `src/screens/auth/register.jsx:283`; menús del reproductor en `src/components/player/Player.jsx:1089`; opciones de orden en `src/screens/library/index.jsx:493`; ajustes del perfil en `src/screens/profile/index.jsx:554`.

Muchos controles se construyeron como `div` o `span` con `onClick`. Parecen botones, pero no reciben foco de teclado, no activan con Enter/Espacio y no comunican su función correctamente a lectores de pantalla.

**Propósito y reparación:** convertir acciones en `button` y navegación en `Link`; conservar el estilo visual; añadir nombre accesible, estado (`aria-expanded`, `aria-pressed`) y orden de foco verificable.

**Criterio de aceptación:** todo el recorrido login → feed → búsqueda → reproducción → biblioteca puede operarse solo con teclado y muestra foco visible.

### UX-02 — Formularios de acceso dependen demasiado de placeholders (P1)

**Evidencia:** `src/screens/auth/login.jsx:116`, `src/screens/auth/login.jsx:132`, `src/screens/auth/register.jsx:203`.

Los placeholders desaparecen al escribir y no reemplazan una etiqueta visible. Esto dificulta revisar datos, recordar qué campo se está editando y entender errores.

**Propósito y reparación:** mantener el aspecto compacto, pero incorporar etiquetas visibles o flotantes, ayuda de contraseña, autocompletado correcto y error asociado al campo mediante `aria-describedby`.

### UX-03 — Confirmaciones y mensajes usan ventanas nativas (P1)

**Evidencia:** avisos en `src/context/userContext.jsx:180`; creación de biblioteca en `src/screens/library/index.jsx:171`; borrado en `src/screens/library/index.jsx:211`; cierre de sesión en `src/screens/profile/index.jsx:85`; añadir a playlist en `src/components/player/Player.jsx:574`.

`alert()` y `confirm()` rompen el lenguaje visual, bloquean la interfaz y ofrecen poco contexto. Además, el reproductor ya posee modales propios, por lo que la experiencia cambia según la pantalla.

**Propósito y reparación:** crear un sistema único de notificaciones y diálogo de confirmación. Usar toast para éxitos/errores reversibles y modal accesible para acciones destructivas.

### UX-04 — Sistema visual duplicado y estilos difíciles de gobernar (P1)

**Evidencia:** `src/screens/feed/feed.css` (~48 KB), `src/components/player/Player.css` (~46 KB), `src/screens/library/library.css` (~41 KB); existen dos familias de componentes compartidos en `src/components/shared/` y `src/shared/components/`.

La interfaz tiene tokens globales y buenas bases de foco/movimiento reducido, pero cada pantalla acumula variantes propias. Esto aumenta la posibilidad de diferencias en radios, espacios, tipografía, sombras, estados hover y comportamiento móvil.

**Propósito y reparación:** conservar el estilo oscuro y musical, consolidar Button, Card, PageHeader, Modal, EmptyState, Skeleton y Toast en una sola carpeta; definir tokens de espaciado, capas, tamaños táctiles y tipografía.

### UX-05 — Navegación sin una página explícita de “no encontrado” (P2)

**Evidencia:** `src/screens/home/index.jsx:111` redirige cualquier ruta desconocida silenciosamente al feed.

El usuario no sabe que un enlace era inválido o que una playlist ya no existe.

**Propósito y reparación:** incorporar una pantalla 404 breve con regreso al feed y búsqueda. Para entidades inexistentes, mostrar un estado específico en vez de una redirección genérica.

### UX-06 — Rendimiento percibido del área privada (P1)

**Evidencia:** `src/screens/home/index.jsx:74-113` mantiene Feed, Search y Library montados simultáneamente y solo cambia su visibilidad. El build genera `PrivateApp` de ~259 KB JS y ~194 KB CSS, además de Firebase (~559 KB JS), antes de compresión.

Mantener pantallas pesadas puede preservar scroll, pero también conserva efectos, memoria, listas y solicitudes que el usuario no está viendo. En teléfonos esto puede sentirse como lentitud, calentamiento o cambios tardíos.

**Propósito y reparación:** montar solo la ruta activa y conservar únicamente el estado útil (scroll, consulta y filtros) en el caché ya existente. Cargar perfil, importación y detalles de forma diferida.

**Criterio de aceptación:** cambiar de sección no dispara solicitudes de las pantallas ocultas; el estado visible se restaura; no hay saltos de layout.

### UX-07 — Experiencia móvil debe validarse como recorrido, no solo con media queries (P1)

Hay múltiples reglas responsivas y soporte para movimiento reducido, lo cual es positivo. Sin embargo, la cantidad de capas del reproductor, cola, letras, menús y modales requiere pruebas reales de 320–430 px y con teclado móvil.

**Propósito y reparación:** definir navegación móvil persistente, zonas táctiles mínimas de 44 px, respeto por `safe-area-inset-*`, paneles que no queden bajo el reproductor y bloqueo correcto del scroll al abrir overlays.

### UX-08 — Carga visual del acceso depende de un vídeo externo (P2)

La pantalla de acceso utiliza un fondo audiovisual remoto. Puede consumir datos, tardar o quedar negro por bloqueo de reproducción/red.

**Propósito y reparación:** conservar la atmósfera, pero servir una imagen optimizada local como base; activar vídeo solo con buena conexión y sin preferencia de ahorro de datos/movimiento reducido.

## 4. Funcionalidades obsoletas, rotas o sin propósito claro

### FN-01 — “Descargas” es un botón ficticio (P1)

**Evidencia:** comentario explícito `Descargas (placeholder para futura funcionalidad)` en `src/screens/library/index.jsx:371`.

Mostrarlo junto a funciones reales crea una promesa incumplida.

**Decisión recomendada:** **retirar temporalmente**. Solo debe volver si se implementa descarga/offline real, indicador de progreso, gestión de espacio, expiración y licencias. No conviene simularla con caché del navegador.

### FN-02 — Cifras de reproducción inventadas e inestables (P1)

**Evidencia:** `src/components/player/Player.jsx:1236` usa `Math.random()` para mostrar entre 100k y 599k reproducciones.

La cifra cambia al renderizar y presenta como real un dato inexistente, lo que afecta la confianza.

**Decisión recomendada:** **retirar el contador** hasta disponer de una fuente real. Como alternativa honesta, mostrar popularidad relativa o no mostrar métrica.

### FN-03 — Playlist “mágica” ignora el historial real (P1)

**Evidencia:** `src/screens/library/index.jsx:167` pasa `listeningHistory: []` con un TODO.

La función promete personalización, pero genera resultados sin el principal contexto del usuario.

**Decisión recomendada:** **reparar y posicionar** como “Crear mix por ambiente”. Combinar texto del usuario, favoritos e historial; explicar por qué se eligieron canciones y permitir regenerar.

### FN-04 — Importación de YouTube usa fallbacks frágiles del navegador (P1)

**Evidencia:** `src/services/importService.js:721-935` prueba backend, scraping directo, varios proxies públicos e instancias de Invidious.

CORS, cambios de HTML, límites y disponibilidad de terceros hacen que el resultado varíe sin que el usuario entienda por qué. La lógica también aumenta mucho el mantenimiento del frontend.

**Decisión recomendada:** **reparar en el backend**. El frontend solo valida la URL, crea un trabajo de importación, muestra progreso y permite reintentar. El backend debe resolver proveedor, límites, normalización y errores.

### FN-05 — Importación de Spotify necesita estados de configuración y sesión más claros (P1)

**Evidencia:** `src/services/importService.js:353`, `:431`, `:448` puede fallar por cliente no configurado, ausencia de autenticación o sesión vencida; mensajes internos están en inglés.

**Decisión recomendada:** **conservar y reparar**. Antes de ofrecer Spotify, comprobar disponibilidad; traducir errores; diferenciar “conectar”, “reconectar” y “servicio no configurado”; permitir reanudar una selección tras OAuth.

### FN-06 — Perfil público/privado no tiene un propósito visible completo (P2)

**Evidencia:** selector en `src/screens/profile/index.jsx:490-518`; no existe en el frontend una experiencia clara para descubrir o visitar perfiles de otros usuarios.

Una opción de privacidad sin superficie social asociada genera dudas sobre qué información se publica.

**Decisión recomendada:** **redefinir**. En esta etapa, renombrar a “Visibilidad de actividad” y explicar exactamente qué datos afecta, o esconderla hasta crear perfiles públicos reales.

### FN-07 — Tema e incógnito son estados heredados sin control utilizable (P2)

**Evidencia:** `src/screens/profile/index.jsx:29-30` lee `paradox_theme` y `paradox_incognito`, pero el perfil no presenta controles para modificarlos.

**Decisión recomendada:** tema oscuro debe ser la opción única hasta implementar un tema claro completo. “Incógnito” debería convertirse en “Pausar historial de escucha”, con interruptor, explicación y efecto real sobre recomendaciones.

### FN-08 — PWA declarada sin estrategia offline completa (P2)

**Evidencia:** `public/manifest.json` declara modo `standalone`, orientación y accesos directos, pero no existe service worker activo. `public/iconapp.png` se declara como varios tamaños en un solo archivo.

**Decisión recomendada:** **redefinir o retirar la promesa**. Si se conserva PWA, generar iconos 192/512 y maskable reales, añadir actualización segura y una pantalla offline honesta. Esto no equivale a descargar música.

### FN-09 — Búsqueda y feed duplican lógica de “radio instantánea” (P2)

**Evidencia:** construcción de radio en `src/screens/search/search.jsx:401-574` y otra implementación extensa en `src/screens/feed/feed.jsx:540-733`.

Dos algoritmos para la misma promesa producirán colas distintas y fallos difíciles de corregir.

**Decisión recomendada:** **conservar la función y unificarla** en un servicio de radio/cola con contrato único, cancelación y telemetría de fallos.

### FN-10 — Registro excesivo en consola de producción (P2)

**Evidencia:** hay numerosos `console.log/warn/error` en player, feed, búsqueda, importación y contexto de usuario; algunos incluyen títulos, artistas, URLs y estado interno.

**Decisión recomendada:** sustituirlos por un logger con niveles; desactivar debug en producción; registrar métricas agregadas y errores sin datos personales.

### FN-11 — Reproductor monolítico y comportamiento difícil de verificar (P1)

**Evidencia:** `src/components/player/Player.jsx` contiene dock, pantalla completa, letras, cola, menús, hoja de artista, navegación y estado de interacción; `src/context/playerContext.jsx` concentra audio, prefetch, crossfade, radio y recuperación de errores.

**Decisión recomendada:** **conservar y dividir por responsabilidad** sin cambiar primero el aspecto: PlaybackEngine, Queue, Dock, FullscreenPlayer, Lyrics, TrackMenu y ArtistSheet. Añadir estados definidos para cargando, sin audio, reintentando y agotado.

### FN-12 — Ausencia de una política uniforme de errores y vacíos (P1)

Algunas funciones devuelven listas vacías o `null`, otras muestran alertas y otras solo escriben en consola. Para el usuario, “sin resultados”, “sin conexión”, “servicio caído” y “audio no disponible” pueden parecer lo mismo.

**Decisión recomendada:** definir cuatro estados reutilizables: vacío inicial, sin resultados, error recuperable y función no disponible. Cada uno debe ofrecer una acción siguiente concreta.

## 5. Inventario de decisiones

| Función | Decisión | Propósito final |
|---|---|---|
| Login, registro y onboarding | Conservar y pulir | Entrada clara, accesible y rápida. |
| Feed personalizado | Conservar y simplificar | Descubrimiento explicado y progresivo. |
| Búsqueda | Conservar y reparar | Encontrar y reproducir con feedback inmediato. |
| Radio instantánea/infinita | Conservar y unificar | Continuidad musical desde cualquier canción o artista. |
| Reproductor, cola y letras | Conservar y modularizar | Núcleo confiable de la experiencia. |
| Favoritos, artistas, álbumes y playlists | Conservar | Biblioteca personal predecible. |
| Playlist mágica | Redefinir | Mix por ambiente usando contexto real. |
| Spotify import | Conservar y reparar | Migración guiada y reanudable. |
| YouTube import | Mover al backend | Importación consistente y observable. |
| Descargas | Retirar por ahora | Volver solo con offline real. |
| Contadores aleatorios | Retirar | Mostrar únicamente datos verificables. |
| Perfil público/privado | Redefinir | Privacidad explicable o futura capa social. |
| Incógnito heredado | Redefinir | Pausar historial de escucha. |
| Tema heredado | Retirar por ahora | Oscuro único hasta completar tema claro. |
| PWA | Decidir explícitamente | Instalación correcta o manifest mínimo sin promesas offline. |

## 6. Plan de reparación recomendado

### Fase 1 — Honestidad y recorridos esenciales

1. Retirar Descargas y los contadores aleatorios.
2. Crear Toast, ConfirmDialog y estados de error/vacío comunes.
3. Corregir semántica y teclado en navegación, tarjetas, menús y formularios.
4. Estabilizar reproducción: cargando, error, reintento, siguiente canción y cola agotada.
5. Crear pruebas automáticas de login, búsqueda, reproducir, favorito y playlist.

### Fase 2 — Fluidez y sistema visual

1. Consolidar componentes compartidos y tokens visuales.
2. Montar únicamente la ruta activa y dividir carga privada por pantalla.
3. Validar 320, 375, 430, 768, 1024 y escritorio; teclado y movimiento reducido.
4. Unificar modales, menús, esqueletos y microinteracciones.
5. Diseñar 404 y estados específicos de entidad inexistente.

### Fase 3 — Funciones con propósito

1. Unificar radio instantánea/infinita.
2. Conectar playlist mágica con historial y favoritos reales.
3. Simplificar Spotify y mover YouTube al backend.
4. Decidir alcance de privacidad social, historial pausado y PWA.
5. Añadir medición de éxito sin registrar datos sensibles.

## 7. Primer lote de trabajo propuesto

El primer lote debería ser pequeño y visible:

1. Retirar funciones ficticias y métricas inventadas.
2. Reemplazar `alert/confirm` por feedback propio.
3. Hacer accesibles navegación, cambio de autenticación, menús del player y orden de biblioteca.
4. Corregir formularios de acceso con etiquetas y errores por campo.
5. Añadir pruebas de los cinco recorridos críticos.

Este lote reduce desconfianza y fricción sin alterar todavía la arquitectura musical ni arriesgar los archivos recuperados.

## 8. Verificación realizada

- `npm run lint`: correcto.
- `npm run test:ci`: 1 archivo / 1 prueba correcta.
- `npm run build`: correcto.
- Comprobación del backend: metadatos Deezer, búsqueda musical y resolución de audio correctos.
- Auditoría visual pública: login/registro y estructura general.
- Auditoría estática privada: rutas, pantallas, reproductor, biblioteca, perfil, importación, estados y CSS.

## 9. Limitaciones de esta auditoría

No se usaron credenciales personales ni se modificaron datos de Firebase. Antes de declarar la experiencia privada completamente reparada se necesita una cuenta de prueba aislada y datos de prueba para ejecutar reproducción prolongada, creación/borrado de playlists, subida de avatar, onboarding e importaciones reales.
