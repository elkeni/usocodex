# ParadisQuo

Frontend web de ParadisQuo. Esta es la única fuente de verdad del cliente publicado en [Firebase Hosting](https://appmusica-5c872.web.app).

## Arquitectura

- React 18 y React Router.
- Firebase Authentication, Firestore y Storage para cuentas y biblioteca.
- `https://music-backend-tau.vercel.app` para búsqueda, metadatos y audio.
- Deezer, LRCLIB, iTunes y MusicBrainz se consumen mediante los servicios definidos en `src/services`.
- Firebase Hosting publica automáticamente cada cambio aprobado en `main`.

El backend no debe copiarse dentro de este repositorio.

## Desarrollo local

Requisitos: Node.js 20 o superior y npm.

```bash
npm ci
```

Copia `.env.example` como `.env.local` y completa la configuración pública de Firebase. Después ejecuta:

```bash
npm start
```

La aplicación se abre en `http://localhost:3000`.

## Verificación

```bash
npm run lint
npm run test:ci
npm run build
npm run test:backend
```

`test:backend` comprueba los contratos principales del backend desplegado. No modifica datos.

## Despliegue

El workflow `firebase-hosting-merge.yml` instala dependencias, ejecuta las pruebas, compila y publica el directorio `dist` cuando `main` recibe un cambio.

La configuración web de Firebase es pública y está versionada con el cliente. Para habilitar el despliegue automático sólo hace falta el secreto de repositorio `FIREBASE_SERVICE_ACCOUNT_APPMUSICA_5C872`. Si no está configurado, el workflow valida el frontend y omite la publicación sin fallar.

Nunca debe añadirse un Spotify Client Secret al frontend. La importación usa OAuth PKCE y sólo requiere el Client ID público.

## Estructura útil

```text
src/
├── components/     interfaz compartida, navegación y reproductor
├── context/        sesión, biblioteca, cola y reproducción
├── firebase/       inicialización de Firebase
├── screens/        rutas visibles de la aplicación
├── services/       APIs, recomendaciones, importación y caché
└── shared/         sistema visual global
```

## Reglas de trabajo

- Crear cambios desde `main` y mantener los commits pequeños.
- No guardar secretos ni archivos `.env*` reales.
- No desplegar a GitHub Pages o Vercel desde este repositorio.
- Antes de subir: lint, pruebas y build deben terminar correctamente.
