const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api/deezer',
    createProxyMiddleware({
      target: 'https://api.deezer.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/deezer': '', // Elimina '/api/deezer' antes de enviar a Deezer
      },
    })
  );
};