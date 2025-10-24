const express = require('express');
const FiltroService = require('../services/filtroService');
const ComparacionDNIService = require('../services/comparacionDNIService');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de timeouts para Railway/producción
// Railway tiene timeout de 300 segundos, pero lo configuramos más conservador
const REQUEST_TIMEOUT = process.env.REQUEST_TIMEOUT || 240000; // 4 minutos
const MAX_RUCS_PER_BATCH = process.env.MAX_RUCS_PER_BATCH || 5; // Máximo 5 RUCs por batch

// Middleware para timeout y keep-alive
app.use((req, res, next) => {
  // Configurar timeout de request
  req.setTimeout(REQUEST_TIMEOUT);
  res.setTimeout(REQUEST_TIMEOUT);

  // Configurar keep-alive para mantener conexión abierta
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=300');

  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Permitir requests desde Vercel y localhost
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://sistema-de-filtro.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Permitir requests sin origin (como curl o Postman)
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Servir archivos estáticos (Frontend) - solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static('public'));
}

// Instancia de los servicios
const filtroService = new FiltroService();
const comparacionDNIService = new ComparacionDNIService();

/**
 * Endpoint principal: Filtrar un RUC
 */
app.post('/api/filtrar-ruc', async (req, res) => {
  try {
    const { ruc } = req.body;

    if (!ruc) {
      return res.status(400).json({
        success: false,
        error: 'El campo RUC es requerido'
      });
    }

    // Validar formato de RUC (11 dígitos)
    if (!/^\d{11}$/.test(ruc)) {
      return res.status(400).json({
        success: false,
        error: 'El RUC debe tener 11 dígitos'
      });
    }

    const resultado = await filtroService.procesarRUC(ruc);

    res.json({
      success: true,
      data: resultado
    });

  } catch (error) {
    console.error('Error en /api/filtrar-ruc:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      mensaje: error.message
    });
  }
});

/**
 * Endpoint: Filtrar múltiples RUCs
 */
app.post('/api/filtrar-rucs-batch', async (req, res) => {
  try {
    const { rucs } = req.body;

    if (!rucs || !Array.isArray(rucs)) {
      return res.status(400).json({
        success: false,
        error: 'El campo rucs debe ser un array'
      });
    }

    if (rucs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El array de RUCs no puede estar vacío'
      });
    }

    // IMPORTANTE: Limitar cantidad de RUCs para evitar timeouts en Railway
    if (rucs.length > MAX_RUCS_PER_BATCH) {
      return res.status(400).json({
        success: false,
        error: `Por limitaciones de tiempo, solo se pueden procesar máximo ${MAX_RUCS_PER_BATCH} RUCs por vez. Recibiste ${rucs.length}.`,
        sugerencia: `Divide tu lista en grupos de ${MAX_RUCS_PER_BATCH} RUCs`
      });
    }

    // Validar formato de cada RUC
    const rucsInvalidos = rucs.filter(ruc => !/^\d{11}$/.test(ruc));
    if (rucsInvalidos.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Algunos RUCs tienen formato inválido',
        rucsInvalidos
      });
    }

    console.log(`[BATCH] Procesando ${rucs.length} RUCs...`);
    const startTime = Date.now();

    const resultados = await filtroService.procesarMultiplesRUCs(rucs);

    const endTime = Date.now();
    const tiempoTotal = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`[BATCH] Completado en ${tiempoTotal}s`);
    const reporte = filtroService.generarReporte(resultados);

    res.json({
      success: true,
      reporte,
      resultados
    });

  } catch (error) {
    console.error('Error en /api/filtrar-rucs-batch:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      mensaje: error.message
    });
  }
});

/**
 * Endpoint: Validar un DNI específico
 */
app.post('/api/validar-dni', async (req, res) => {
  try {
    const { dni } = req.body;

    if (!dni) {
      return res.status(400).json({
        success: false,
        error: 'El campo DNI es requerido'
      });
    }

    // Validar formato de DNI (8 dígitos)
    if (!/^\d{8}$/.test(dni)) {
      return res.status(400).json({
        success: false,
        error: 'El DNI debe tener 8 dígitos'
      });
    }

    const resultado = await filtroService.ejzagetroScraper.buscarDNI(dni);

    res.json({
      success: true,
      data: resultado
    });

  } catch (error) {
    console.error('Error en /api/validar-dni:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      mensaje: error.message
    });
  }
});

/**
 * Endpoint: Comparar múltiples DNIs y detectar vínculos familiares
 */
app.post('/api/comparar-dnis', async (req, res) => {
  try {
    const { dnis } = req.body;

    // Validar que se envió el campo dnis
    if (!dnis) {
      return res.status(400).json({
        success: false,
        error: 'El campo dnis es requerido'
      });
    }

    // Validar que sea un array
    if (!Array.isArray(dnis)) {
      return res.status(400).json({
        success: false,
        error: 'El campo dnis debe ser un array'
      });
    }

    // Validar que no esté vacío
    if (dnis.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar al menos un DNI'
      });
    }

    // Validar que haya al menos 2 DNIs para comparar
    if (dnis.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar al menos 2 DNIs para comparar'
      });
    }

    // Validar formato de cada DNI (8 dígitos)
    const dnisInvalidos = dnis.filter(dni => !/^\d{8}$/.test(dni));
    if (dnisInvalidos.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Algunos DNIs tienen formato inválido (deben ser 8 dígitos)',
        dnisInvalidos
      });
    }

    // Eliminar duplicados
    const dnisUnicos = [...new Set(dnis)];
    if (dnisUnicos.length !== dnis.length) {
      console.log(`⚠️  Se eliminaron ${dnis.length - dnisUnicos.length} DNI(s) duplicado(s)`);
    }

    // Procesar comparación
    const resultado = await comparacionDNIService.compararDNIs(dnisUnicos);
    const reporte = comparacionDNIService.generarReporte(resultado);

    res.json({
      success: true,
      reporte,
      detalles: resultado
    });

  } catch (error) {
    console.error('Error en /api/comparar-dnis:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      mensaje: error.message
    });
  }
});

/**
 * Endpoint: Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Sistema de Filtro',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * Endpoint: Página principal con documentación
 */
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sistema de Filtro - API</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        .endpoint { background: #f4f4f4; padding: 15px; margin: 10px 0; border-radius: 5px; }
        code { background: #e0e0e0; padding: 2px 5px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>🔍 Sistema de Filtro - API</h1>
      <p>API para filtrado de RUCs y validación de DNIs contra base de datos de familiares.</p>

      <h2>Endpoints Disponibles:</h2>

      <div class="endpoint">
        <h3>POST /api/filtrar-ruc</h3>
        <p>Filtra un RUC individual</p>
        <p><strong>Body:</strong> <code>{ "ruc": "20123456789" }</code></p>
      </div>

      <div class="endpoint">
        <h3>POST /api/filtrar-rucs-batch</h3>
        <p>Filtra múltiples RUCs</p>
        <p><strong>Body:</strong> <code>{ "rucs": ["20123456789", "10987654321"] }</code></p>
      </div>

      <div class="endpoint">
        <h3>POST /api/validar-dni</h3>
        <p>Valida un DNI específico</p>
        <p><strong>Body:</strong> <code>{ "dni": "12345678" }</code></p>
      </div>

      <div class="endpoint">
        <h3>POST /api/comparar-dnis</h3>
        <p>Compara múltiples DNIs y detecta vínculos familiares</p>
        <p><strong>Body:</strong> <code>{ "dnis": ["12345678", "87654321", "11223344"] }</code></p>
      </div>

      <div class="endpoint">
        <h3>GET /api/health</h3>
        <p>Verifica el estado del servicio</p>
      </div>
    </body>
    </html>
  `);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Sistema de Filtro iniciado`);
  console.log(`📡 Servidor escuchando en http://localhost:${PORT}`);
  console.log(`📖 Documentación disponible en http://localhost:${PORT}`);
  console.log(`\nEndpoints disponibles:`);
  console.log(`  POST /api/filtrar-ruc`);
  console.log(`  POST /api/filtrar-rucs-batch`);
  console.log(`  POST /api/validar-dni`);
  console.log(`  POST /api/comparar-dnis`);
  console.log(`  GET  /api/health\n`);
});

module.exports = app;
