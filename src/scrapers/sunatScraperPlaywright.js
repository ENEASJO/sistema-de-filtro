const { chromium } = require('playwright');

/**
 * Scraper para SUNAT usando Playwright - Obtiene información de RUC y DNIs de representantes
 */
class SunatScraperPlaywright {
  constructor() {
    this.url = 'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp';
  }

  /**
   * Busca un RUC en SUNAT y extrae los DNIs de las personas involucradas
   * @param {string} ruc - Número de RUC a buscar
   * @returns {Promise<Object>} Información del RUC y DNIs encontrados
   */
  async buscarPorRUC(ruc) {
    let browser;
    let context;

    try {
      console.log(`[SUNAT-PW] Iniciando búsqueda para RUC: ${ruc}`);

      browser = await chromium.launch({
        headless: true
      });

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      const page = await context.newPage();

      console.log('[SUNAT-PW] Navegando a la página...');
      await page.goto(this.url, { waitUntil: 'networkidle', timeout: 30000 });

      console.log('[SUNAT-PW] Ingresando RUC...');
      await page.fill('input[placeholder*="Ingrese RUC"]', ruc);

      console.log('[SUNAT-PW] Haciendo clic en Buscar...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        page.click('button:has-text("Buscar")')
      ]);

      console.log('[SUNAT-PW] Extrayendo información básica...');
      const datos = await page.evaluate(() => {
        const resultado = {
          razonSocial: '',
          ruc: '',
          tipo: '',
          estado: '',
          condicion: '',
          direccion: '',
          representantes: [],
          dnis: []
        };

        // Extraer razón social y RUC del segundo h4
        const headings = document.querySelectorAll('h4');
        if (headings.length >= 2) {
          const rucHeading = headings[1];
          if (rucHeading && rucHeading.textContent.includes('-')) {
            const partes = rucHeading.textContent.split('-');
            if (partes.length >= 2) {
              resultado.ruc = partes[0].trim();
              resultado.razonSocial = partes.slice(1).join('-').trim();
            }
          }
        }

        return resultado;
      });

      // Buscar botón de representantes
      console.log('[SUNAT-PW] Buscando botón de representantes...');
      const hasRepresentantes = await page.locator('button:has-text("Representante")').count() > 0;

      if (hasRepresentantes) {
        console.log('[SUNAT-PW] Modificando formulario para abrir en nueva pestaña...');

        // Configurar el formulario para que se abra en _blank
        await page.evaluate(() => {
          const form = document.formRepLeg;
          if (form) {
            form.target = '_blank';
          }
        });

        console.log('[SUNAT-PW] Esperando popup al hacer clic...');

        // Esperar el popup cuando se haga clic
        const popupPromise = context.waitForEvent('page');

        // Hacer clic en el botón
        await page.click('button:has-text("Representante")');

        // Esperar el popup con timeout
        const popup = await popupPromise.catch(() => null);

        if (popup) {
          console.log('[SUNAT-PW] Popup detectado, esperando carga...');
          await popup.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

          // Esperar un poco más para asegurar que todo cargó
          await page.waitForTimeout(1000);

          console.log('[SUNAT-PW] Extrayendo DNIs y nombres del popup...');
          const representantes = await popup.evaluate(() => {
            const personas = [];

            // Buscar en tabla - estructura: Documento | Nro. Documento | Nombre | Cargo | Fecha
            const rows = document.querySelectorAll('table tr');
            rows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 3) {
                const tipoDoc = cells[0].textContent.trim(); // "DNI"
                const nroDoc = cells[1].textContent.trim();  // "42137216"
                const nombre = cells[2].textContent.trim();  // "DIAZ GARAY EDGARDO NIVARDO"

                if (/^\d{8}$/.test(nroDoc) && tipoDoc === 'DNI') {
                  personas.push({
                    dni: nroDoc,
                    nombre: nombre
                  });
                }
              }
            });

            return personas;
          });

          datos.representantes = representantes;
          datos.dnis = [...new Set(representantes.map(r => r.dni))];
          console.log(`[SUNAT-PW] DNIs extraídos: ${datos.dnis.join(', ')}`);

          await popup.close();
        } else {
          console.log('[SUNAT-PW] No se pudo abrir popup de representantes');
        }
      } else {
        console.log('[SUNAT-PW] No se encontró botón de representantes');
      }

      console.log(`[SUNAT-PW] Encontrados ${datos.dnis.length} DNIs para RUC ${ruc}`);
      console.log(`[SUNAT-PW] Razón Social: ${datos.razonSocial}`);

      await context.close();
      await browser.close();

      return datos;

    } catch (error) {
      console.error(`[SUNAT-PW] Error en búsqueda: ${error.message}`);
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      throw error;
    }
  }
}

module.exports = SunatScraperPlaywright;
