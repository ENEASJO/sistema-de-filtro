# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sistema de Filtro is an automated RUC (Peruvian tax ID) filtering and DNI (Peruvian national ID) validation system that prevents payments to individuals detected in public family relationship registries. The system scrapes data from SUNAT (tax authority), OSCE (public procurement), and ejzagetro.com (family relationship database).

**Purpose**: Detect potential conflicts of interest by identifying family relationships between DNI holders before approving payments.

## Development Commands

### Running the Application

```bash
# Start web server (installs Playwright browsers first, then starts server)
npm start

# Start server directly (development)
npm run dev
# or
node src/api/server.js

# CLI mode - filter single RUC
npm run filtrar <RUC>
# or
node index.js <RUC>
```

### Dependencies

```bash
# Install dependencies
npm install

# Install Playwright browsers (required for SUNAT scraping)
npx playwright install chromium
```

### Testing

No test suite is currently configured. Manual testing is done via:
- CLI: `node index.js <RUC>`
- API: `curl -X POST http://localhost:3000/api/filtrar-ruc -H "Content-Type: application/json" -d '{"ruc":"20123456789"}'`
- Web UI: Open `http://localhost:3000` in browser

## Architecture Overview

### Core Components

**Services Layer** (`src/services/`):
- `FiltroService`: Main orchestration service for RUC processing. Coordinates SUNAT, OSCE, and ejzagetro scrapers to validate DNIs against family relationship database
- `ComparacionDNIService`: Compares multiple DNIs to detect family relationships between them (does NOT scrape SUNAT/OSCE, only validates against ejzagetro)

**Scrapers Layer** (`src/scrapers/`):
- `sunatScraperPlaywright.js`: Scrapes SUNAT using Playwright (headless Chromium) to extract company info and representative DNIs from RUC
- `osceScraper.js`: Scrapes OSCE using Puppeteer to extract additional company data and associated DNIs
- `ejzagetroScraper.js`: Validates DNIs against ejzagetro.com family database using Playwright. Returns whether a DNI has registered family members

**API Layer** (`src/api/server.js`):
- Express REST API with 5 main endpoints
- CORS configured for localhost and Vercel deployment
- Serves static files from `public/` in non-production environments

**Frontend** (`public/`):
- `index.html`: Multi-tab interface (Individual RUC, Batch RUC, DNI Comparison)
- `js/app.js`: Main frontend logic for all three search modes
- `js/ocr-mejorado.js`: OCR functionality using Tesseract.js to extract RUCs from images (supports paste from clipboard)
- `css/styles.css`: Dark/light mode styling

### Data Flow

#### RUC Filtering Flow (`FiltroService.procesarRUC`):
1. Validate RUC format (11 digits, prefix 10/15/17/20)
2. Query SUNAT and OSCE in parallel (`Promise.allSettled`) to extract DNIs
3. Validate each DNI in ejzagetro.com to check for family relationships
4. Aggregate results and determine payment approval (reject if ANY DNI has family members)
5. Return complete result with validation details

#### DNI Comparison Flow (`ComparacionDNIService.compararDNIs`):
1. Validate each DNI in ejzagetro.com (does NOT scrape SUNAT/OSCE)
2. Detect family links between provided DNIs
3. Return vinculos (links) showing which DNIs are related and their relationship type

### RUC Type Routing

RUCs are validated by prefix:
- `10`: Natural person (Persona Natural) - routes to Individual search
- `15`: Public entity
- `17`: Non-domiciled
- `20`: Legal entity (Persona Jurídica) - routes to Batch search for multiple RUCs

### Key Technical Details

**Web Scraping**:
- SUNAT uses Playwright (more stable for complex interactions)
- OSCE uses Puppeteer (simpler pages)
- ejzagetro uses Playwright
- All scrapers run in headless mode with custom user agents
- Scrapers handle timeouts and missing data gracefully

**Name Formatting** (`src/utils/formatNombre.js`):
- Standardizes names to uppercase
- Adds comma after first 2 words (apellidos): "GARCIA LOPEZ JUAN CARLOS" → "GARCIA LOPEZ, JUAN CARLOS"
- Used consistently across all scrapers

**Module Cache Clearing** (filtroService.js:1-4):
- Clears require cache for scrapers to ensure fresh instances
- Critical for development hot-reloading

**Parallel Data Fetching**:
- SUNAT and OSCE scraped in parallel using `Promise.allSettled`
- Continues even if one source fails (degraded mode)

## API Endpoints

### POST /api/filtrar-ruc
Filter single RUC. Validates format, scrapes SUNAT/OSCE, checks DNIs against family database.

**Body**: `{ "ruc": "20123456789" }`
**Returns**: Complete result object with `aprobado` boolean and `validacionesDNI` array

### POST /api/filtrar-rucs-batch
Filter multiple RUCs sequentially.

**Body**: `{ "rucs": ["20123456789", "10987654321"] }`
**Returns**: Array of results plus summary report

### POST /api/validar-dni
Validate single DNI against ejzagetro only (no RUC scraping).

**Body**: `{ "dni": "12345678" }`
**Returns**: Validation result with `esFamiliar` boolean

### POST /api/comparar-dnis
Compare multiple DNIs to detect family relationships between them. Does NOT scrape SUNAT/OSCE.

**Body**: `{ "dnis": ["12345678", "87654321"] }` (minimum 2 DNIs)
**Returns**: Vínculos (family links) between provided DNIs

### GET /api/health
Health check endpoint

## Important Implementation Notes

### When Adding New Scrapers
1. Use Playwright or Puppeteer in headless mode
2. Set custom user agent to avoid bot detection
3. Implement proper timeout handling (use `waitUntil: 'domcontentloaded'` instead of fixed delays)
4. Return consistent data structure with error handling
5. Add console logging for debugging with `[SCRAPER_NAME]` prefix

### When Modifying Services
- `FiltroService` expects scrapers to return `{ dnis: [], razonSocial: '', representantes: [] }`
- Always use `Promise.allSettled` for parallel operations to handle partial failures
- Update `personasDetalladas` array to track data sources (SUNAT, OSCE, ejzagetro)

### Frontend Integration
- Frontend polls or waits for API responses (no WebSocket/SSE)
- OCR feature extracts RUCs from images using Tesseract.js (see `js/ocr-mejorado.js`)
- Ctrl+V paste support for images added in recent commits

### RUC Validation Rules
- Must be exactly 11 digits
- Must start with 10, 15, 17, or 20
- Implemented in `FiltroService.validarFormatoRUC()`

### DNI Validation Rules
- Must be exactly 8 digits
- Validated in API endpoints and scrapers

## Environment Variables

```bash
PORT=3000          # Server port (default: 3000)
NODE_ENV=production # Set to production to disable static file serving
```

## Recent Changes (from git log)

- Added Ctrl+V paste support for OCR images
- Improved OCR with 7 main enhancements
- Route single RUC to Individual search, multiple RUCs to Batch search
- Filter to only show Legal Entity RUCs (20*) in batch search
- Documented RUC types in OCR code

## Deployment Notes

- Frontend can be deployed separately (e.g., Vercel)
- Backend requires Node.js ≥18.0.0
- Playwright browsers must be installed in production (`npx playwright install chromium`)
- CORS configured for `https://sistema-de-filtro.vercel.app`
