# Adaptación desktop/tablet — validación

## Base de producción recuperada

La versión Firebase `c8e6a8bf4fdb8a31` (release `1788666799594000`) procedía de cambios sin commit en `D:/backend/usocodex`, sobre una revisión anterior a main. Se integró esa fuente publicada en el commit `9aff803`, conservando su estado visual y funcional. La compilación local reprodujo los identificadores publicados `index-brceuLyE.js`, `index-DxqbZdyS.css` y `PrivateApp-CGR8-1Cc.js` antes de aplicar el rediseño.

## Estrategia aplicada

- Mobile hasta 767 px: misma estructura, comportamiento y estilos aprobados.
- A partir de 768 px enteros: navegación lateral compacta de 104 px. La consulta `width > 767px` también cubre anchos fraccionarios por zoom que quedaban entre las reglas antiguas.
- Desde 1024 px: barra lateral de 224 px. Desde 1280 px: canciones de búsqueda en dos columnas.
- El shell reserva una sola vez el espacio del reproductor; Perfil conserva su portal y deja visible la navegación en desktop.
- Álbumes y artistas mantienen sus acciones superiores visibles mediante CSS sticky dentro de su área de scroll.
- Playlist adopta la jerarquía visual de Álbum: portada compacta, título y metadatos a su lado, acciones glass y filas con duración y opciones. Sus formularios y handlers no cambian.
- Biblioteca distribuye sus cuatro accesos en dos columnas; las rejillas se ajustan al ancho disponible.
- Reproductor ampliado en dos columnas. Cola, letra y menús siguen accesibles; los menús de la última canción y el diálogo para añadir canciones caben en ventanas bajas.

La implementación responsive sólo añade `desktopExperience.css`, su import y una prueba de aislamiento. Sidebar, SidebarButton, Player, la estructura de playlist y la capa mobile son idénticos a la base publicada recuperada.

## Verificación

- Navegador local con sesión real: Feed, Buscar, Biblioteca, Perfil, artista, álbum y playlist de 96 canciones.
- Tamaños inspeccionados: mobile 320, 375, 390 y 430 px; transición fraccionaria alrededor de 767/768; tablet 768×1024, 900×600, 1023×768, 1024×768 y 1180×820; desktop 1366×768; horizontal corto 844×390.
- Comparación de geometría y estilos de playlist, navegación y MiniPlayer a 390 px con y sin la capa nueva: sin diferencias.
- Prueba automática impide reglas desktop globales o consultas que alcancen el rango mobile aprobado.
- Flujos comprobados: búsqueda, navegación entre rutas, reproducción/pausa, seek con teclado, apertura/cierre de cola y letra, selector de playlists, opciones de pista, acceso al último menú y apertura/cierre de Añadir canciones. No se guardaron ediciones ni se eliminaron datos de biblioteca durante esta revisión.
- Suite de frontend: 144 pruebas aprobadas. Lint y build verificados; el resultado final se comprueba antes de publicar.
- La revisión visual se realizó en el navegador Chromium disponible. No equivale a una prueba física en Safari/iPad.

## Publicación

Los commits separan la reconciliación de producción del rediseño responsive. Publicar main en GitHub y Hosting en Firebase, identificar el commit en el mensaje de release y comprobar que Firebase sirve los archivos de la compilación final.
