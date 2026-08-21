const backendUrl = (process.env.BACKEND_URL || 'https://music-backend-tau.vercel.app').replace(/\/$/, '');

const checks = [
  {
    name: 'Metadatos de Deezer',
    path: '/api/deezer-proxy?endpoint=%2Fsearch%2Ftrack%3Fq%3Ddaft%2520punk%26limit%3D1',
    validate: (data) => Array.isArray(data?.data),
  },
  {
    name: 'Búsqueda musical',
    path: '/api/search?q=Daft%20Punk%20One%20More%20Time&limit=1',
    validate: (data) => Array.isArray(data?.results),
  },
  {
    name: 'Resolución de audio',
    path: '/api/instant-play?artist=Daft%20Punk&track=One%20More%20Time',
    validate: (data) => data?.success === true && typeof data?.audioUrl === 'string',
  },
];

for (const check of checks) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${backendUrl}${check.path}`, { signal: controller.signal });
    const data = await response.json();

    if (!response.ok || !check.validate(data)) {
      throw new Error(`contrato inesperado (HTTP ${response.status})`);
    }

    console.log(`✓ ${check.name}`);
  } finally {
    clearTimeout(timeout);
  }
}
