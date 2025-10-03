const { chromium } = require('playwright');

/**
 * Scraper para OSCE - Obtiene información de proveedores y DNIs
 */
class OsceScraper {
  constructor() {
    this.url = 'https://apps.osce.gob.pe/perfilprov-ui/';
  }

  /**
   * Busca un RUC en OSCE y extrae los DNIs de las personas involucradas
   * @param {string} ruc - Número de RUC a buscar
   * @returns {Promise<Object>} Información del proveedor y DNIs encontrados
   */
  async buscarPorRUC(ruc) {
    let browser;
    let context;
    try {
      console.log(`[OSCE] Iniciando búsqueda para RUC: ${ruc}`);

      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      const page = await context.newPage();

      console.log('[OSCE] Navegando a la página...');
      await page.goto(this.url, { waitUntil: 'networkidle', timeout: 30000 });

      console.log('[OSCE] Ingresando RUC...');
      await page.fill('input[placeholder*="Buscar"]', ruc);

      console.log('[OSCE] Presionando Enter para buscar...');
      await page.keyboard.press('Enter');

      // Esperar resultados
      await page.waitForTimeout(4000);

      console.log('[OSCE] Verificando resultados...');
      // Buscar el link con el RUC y hacer clic
      const resultados = await page.locator(`a:has-text("${ruc}")`).count();

      if (resultados === 0) {
        console.log(`[OSCE] No se encontraron resultados para RUC ${ruc}`);
        await context.close();
        await browser.close();
        return {
          ruc,
          razonSocial: '',
          tipoProveedor: '',
          estado: '',
          representantes: [],
          dnis: []
        };
      }

      console.log('[OSCE] Haciendo clic en el resultado...');
      await page.locator(`a:has-text("${ruc}")`).first().click();

      // Esperar a que cargue la ficha
      await page.waitForTimeout(3000);

      console.log('[OSCE] Extrayendo DNIs y nombres de la ficha...');
      // Extraer información de la ficha detallada
      const datos = await page.evaluate(() => {
        const resultado = {
          ruc: '',
          razonSocial: '',
          tipoProveedor: '',
          estado: '',
          representantes: [],
          dnis: []
        };

        // Extraer información visible en la página
        const textoCompleto = document.body.innerText;

        // Buscar RUC
        const rucMatch = textoCompleto.match(/RUC[:\s]*(\d{11})/i);
        if (rucMatch) resultado.ruc = rucMatch[1];

        // Buscar DNIs con nombres - Patrón: "Nombre Apellidos\nTipo de Documento:\nD.N.I. - 12345678"
        const lineas = textoCompleto.split('\n').map(l => l.trim());

        for (let i = 0; i < lineas.length; i++) {
          const linea = lineas[i];

          // Buscar líneas con "D.N.I. - 12345678"
          const dniMatch = linea.match(/D\.N\.I\.\s*-\s*(\d{8})/i);
          if (dniMatch) {
            const dni = dniMatch[1];

            // Buscar el nombre en las líneas anteriores
            let nombre = '';
            // Retroceder hasta encontrar un nombre (línea con texto largo antes de "Tipo de Documento:")
            for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
              const lineaAnterior = lineas[j];
              if (lineaAnterior &&
                  lineaAnterior.length > 5 &&
                  !lineaAnterior.includes('Documento:') &&
                  !lineaAnterior.includes('D.N.I.') &&
                  !lineaAnterior.includes('Tipo de') &&
                  /[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+/.test(lineaAnterior)) {
                nombre = lineaAnterior;
                break;
              }
            }

            // Validar que el DNI no sea parte de un RUC
            // Los DNIs en Perú empiezan típicamente con números del 0-7, no con 2
            // Si empieza con 20, probablemente sea un RUC mal extraído
            const esProbableRUC = dni.startsWith('20') || dni.startsWith('10') || dni.startsWith('15') || dni.startsWith('17');

            if (!esProbableRUC && nombre && nombre !== 'Sin nombre') {
              resultado.representantes.push({
                dni: dni,
                nombre: nombre
              });
              resultado.dnis.push(dni);
            }
          }
        }

        // Eliminar duplicados de DNIs
        resultado.dnis = [...new Set(resultado.dnis)];

        // Extraer razón social
        const primerParrafo = document.body.innerText.split('\n').find(line =>
          line.length > 10 && !line.includes('RUC') && !line.includes('Vigentes')
        );
        if (primerParrafo) {
          resultado.razonSocial = primerParrafo.trim();
        }

        return resultado;
      });

      console.log(`[OSCE] Encontrados ${datos.dnis.length} DNIs para RUC ${ruc}`);
      if (datos.dnis.length > 0) {
        console.log(`[OSCE] DNIs: ${datos.dnis.join(', ')}`);
      }

      await context.close();
      await browser.close();
      return datos;

    } catch (error) {
      console.error(`[OSCE] Error en búsqueda: ${error.message}`);
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      throw error;
    }
  }
}

module.exports = OsceScraper;
