# Instrucciones del repositorio

Este repositorio contiene únicamente el frontend React de ParadisQuo.

- Mantén la interfaz y los textos visibles en español.
- Usa `src/services/config.js` como única fuente para la URL del backend.
- No añadas servidores, secretos, Client Secrets ni API keys privadas al frontend.
- Conserva Firebase Authentication, Firestore y Storage mediante `src/firebase/config.js`.
- Reutiliza los contextos actuales para usuario y reproducción; evita estados globales duplicados.
- Mantén accesibilidad por teclado, estados de carga, mensajes de error y diseño adaptable.
- No introduzcas otro sistema visual: utiliza los tokens y estilos de `src/shared`.
- Ejecuta `npm run lint`, `npm run test:ci` y `npm run build` antes de entregar cambios.
- Firebase Hosting es el único destino de despliegue de este frontend.
