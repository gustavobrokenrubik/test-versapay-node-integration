const express = require('express');
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// En src/server.ts, actualizar CORS:
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // O específico a BigCommerce
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('X-Frame-Options', 'ALLOWALL'); // Permitir iframe
  res.header('Content-Security-Policy', "frame-ancestors 'self' https://*.mybigcommerce.com");

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
