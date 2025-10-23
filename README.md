# 🔍 Sistema de Filtro

Sistema automatizado para filtrado de RUCs y validación de DNIs contra base de datos de familiares. Evita pagos a familiares detectados en registros públicos.

## 📋 Descripción

El sistema realiza las siguientes operaciones:

### 🏢 Filtrado de RUCs
1. **Consulta SUNAT**: Extrae información del RUC y DNIs de representantes legales
2. **Consulta OSCE**: Obtiene datos adicionales del proveedor y personas vinculadas
3. **Validación de Familiares**: Verifica cada DNI en ejzagetro.com para detectar familiares
4. **Decisión de Pago**: Aprueba o rechaza el pago según los resultados

### 🔗 Comparación Masiva de DNIs ⭐ NUEVO
1. **Ingreso de DNIs**: Usuario ingresa múltiples DNIs (mínimo 2)
2. **Validación en ejzagetro.com**: Consulta cada DNI para obtener información de familiares
3. **Detección de Vínculos**: Compara los DNIs ingresados y detecta si hay relaciones familiares
4. **Reporte Visual**: Muestra vínculos detectados con nombres, parentescos y relaciones

## 🚀 Instalación

```bash
cd /home/usuario/PROYECTOS/sistema-de-filtro
npm install
```

## 💻 Uso

### Modo CLI (Línea de Comandos)

Filtrar un RUC individual:

```bash
node index.js 20123456789
```

O usando npm:

```bash
npm run filtrar 20123456789
```

### Modo Web (Interfaz Gráfica)

Iniciar el servidor:

```bash
npm start
```

Abrir en el navegador: `http://localhost:3000`

La interfaz web incluye:
- ✅ Búsqueda individual de RUCs
- ✅ Búsqueda masiva (múltiples RUCs)
- ✅ **Comparación masiva de DNIs** ⭐ NUEVO
- ✅ Visualización de resultados en tiempo real
- ✅ Detalles de validación de cada DNI
- ✅ Reporte de aprobados/rechazados
- ✅ Detección de vínculos familiares

#### Endpoints Disponibles:

**1. Filtrar un RUC**
```bash
POST /api/filtrar-ruc
Content-Type: application/json

{
  "ruc": "20123456789"
}
```

**2. Filtrar múltiples RUCs**
```bash
POST /api/filtrar-rucs-batch
Content-Type: application/json

{
  "rucs": ["20123456789", "10987654321"]
}
```

**3. Validar un DNI**
```bash
POST /api/validar-dni
Content-Type: application/json

{
  "dni": "12345678"
}
```

**4. Comparar DNIs y Detectar Vínculos Familiares** ⭐ NUEVO
```bash
POST /api/comparar-dnis
Content-Type: application/json

{
  "dnis": ["12345678", "87654321", "11223344"]
}
```

**Características de la comparación de DNIs:**
- ✅ Ingresa múltiples DNIs (mínimo 2)
- ✅ Detecta vínculos familiares entre ellos
- ✅ NO realiza scraping a SUNAT/OSCE
- ✅ Solo compara los DNIs ingresados contra ejzagetro.com
- ✅ Muestra relaciones familiares detectadas
- ✅ Identifica parentesco (hermano, padre, hijo, etc.)

**5. Health Check**
```bash
GET /api/health
```

## 📁 Estructura del Proyecto

```
sistema-de-filtro/
├── src/
│   ├── scrapers/
│   │   ├── sunatScraper.js           # Scraper para SUNAT
│   │   ├── osceScraper.js            # Scraper para OSCE
│   │   └── ejzagetroScraper.js       # Scraper para ejzagetro.com
│   ├── services/
│   │   ├── filtroService.js          # Lógica principal de filtrado de RUCs
│   │   └── comparacionDNIService.js  # ⭐ Servicio de comparación de DNIs
│   └── api/
│       └── server.js                  # Servidor API REST
├── public/                            # Interfaz web
│   ├── index.html                     # HTML con tabs
│   ├── css/styles.css                 # Estilos (dark/light mode)
│   └── js/app.js                      # Lógica frontend
├── index.js                           # Script CLI principal
├── package.json
└── README.md
```

## 🔧 Tecnologías

- **Node.js** - Runtime
- **Puppeteer** - Web scraping con navegador headless
- **Express** - Framework web para API REST
- **Axios** - Cliente HTTP
- **Cheerio** - Parsing HTML

## 📊 Ejemplo de Respuesta

```json
{
  "ruc": "20123456789",
  "timestamp": "2025-10-01T20:30:00.000Z",
  "aprobado": false,
  "razonSocial": "EMPRESA EJEMPLO S.A.C.",
  "dnisTotales": ["12345678", "87654321"],
  "dnisConFamiliares": ["12345678"],
  "dnisAprobados": ["87654321"],
  "motivoRechazo": "Se encontraron 1 DNI(s) con familiares registrados",
  "validacionesDNI": [
    {
      "dni": "12345678",
      "encontrado": true,
      "esFamiliar": true,
      "nombrePersona": "JUAN PEREZ GARCIA",
      "parentesco": "HERMANO"
    },
    {
      "dni": "87654321",
      "encontrado": false,
      "esFamiliar": false
    }
  ]
}
```

## ⚙️ Variables de Entorno

```bash
PORT=3000                    # Puerto del servidor
NODE_ENV=production          # Modo de producción
REQUEST_TIMEOUT=240000       # Timeout de requests (4 minutos)
MAX_RUCS_PER_BATCH=3        # Máximo RUCs por batch (Railway: 3)
```

## 🚀 Deploy en Railway

### Configuración Requerida

1. **Variables de Entorno** (Railway Dashboard):
   ```
   PORT=3000
   NODE_ENV=production
   MAX_RUCS_PER_BATCH=3
   REQUEST_TIMEOUT=240000
   ```

2. **Build Command**:
   ```
   npm install && npx playwright install chromium
   ```

3. **Start Command**:
   ```
   bash start.sh
   ```

### Limitaciones en Railway (Free Tier)

- ⏱️ **Timeout**: 300 segundos máximo por request
- 💾 **Memoria**: 512MB RAM (navegadores headless consumen mucho)
- 📊 **Batch**: Máximo 3 RUCs por vez (configurable con `MAX_RUCS_PER_BATCH`)

### Recomendaciones

- Para más de 3 RUCs, divide en múltiples requests
- Considera Railway Pro para límites mayores (8GB RAM, sin timeout)
- Los scrapers con Playwright son pesados, ten paciencia

## 📝 Notas Importantes

- El sistema utiliza Puppeteer en modo headless para realizar scraping
- Se recomienda un delay entre consultas para evitar bloqueos
- Los resultados se procesan de forma secuencial para garantizar precisión
- El sistema está optimizado para RUCs de Perú

## 🛡️ Consideraciones de Seguridad

- No almacena datos sensibles
- Procesa información de fuentes públicas
- Implementa delays para evitar saturación de servidores

## 📄 Licencia

ISC

## 👨‍💻 Autor

Sistema desarrollado para control interno de pagos
