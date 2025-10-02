const { chromium } = require('playwright');

/**
 * Scraper para ejzagetro.com - Valida si un DNI aparece como familiar
 */
class EjzagetroScraper {
  constructor() {
    this.url = 'http://ejzagetro.com/consulta/';
  }

  /**
   * Busca un DNI en ejzagetro.com para verificar si aparece como familiar
   * @param {string} dni - Número de DNI a buscar
   * @returns {Promise<Object>} Resultado de la búsqueda
   */
  async buscarDNI(dni) {
    let browser;
    let context;
    try {
      console.log(`[EJZAGETRO] Validando DNI: ${dni}`);

      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      const page = await context.newPage();

      console.log('[EJZAGETRO] Navegando a la página...');
      await page.goto(this.url, { waitUntil: 'networkidle', timeout: 30000 });

      console.log('[EJZAGETRO] Ingresando DNI...');
      // Esperar input y llenar
      await page.fill('input[type="text"]', dni);

      console.log('[EJZAGETRO] Haciendo clic en Buscar...');
      await page.click('button:has-text("Buscar")');

      // Esperar resultados (reducido de 3s a 1.5s)
      await page.waitForTimeout(1500);

      // Extraer resultados
      const resultado = await page.evaluate(() => {
        const data = {
          dni: '',
          encontrado: false,
          esFamiliar: false,
          nombrePersona: '',
          nombreFamiliar: '',
          parentesco: '',
          detalles: ''
        };

        const textoCompleto = document.body.innerText;

        // Verificar si se encontró información
        if (textoCompleto.toLowerCase().includes('no se encontr') ||
            textoCompleto.toLowerCase().includes('sin resultados') ||
            textoCompleto.toLowerCase().includes('no existe') ||
            textoCompleto.toLowerCase().includes('no registrado')) {
          data.encontrado = false;
          return data;
        }

        // Si hay resultados
        data.encontrado = true;

        // Buscar la etiqueta PARENTESCO específicamente
        // Buscar PARENTESCO seguido de : o espacios, y capturar la palabra siguiente
        const parentescoMatch = textoCompleto.match(/PARENTESCO[:\s]+(\w+)/i);
        if (parentescoMatch) {
          data.parentesco = parentescoMatch[1].trim().toUpperCase();

          // Si parentesco es diferente de "NINGUNO", entonces SÍ tiene familiares
          if (data.parentesco !== 'NINGUNO') {
            data.esFamiliar = true;
          }
        }

        // Extraer nombres - buscar "NOMBRES" seguido del nombre
        const nombresMatch = textoCompleto.match(/NOMBRES[:\s]*([\w\s,áéíóúÁÉÍÓÚñÑ]+)/i);
        if (nombresMatch) {
          data.nombrePersona = nombresMatch[1].trim().split('\n')[0].trim();
        }

        // Capturar detalles adicionales
        data.detalles = textoCompleto.trim();

        return data;
      });

      resultado.dni = dni;

      console.log(`[EJZAGETRO] DNI ${dni} - Parentesco: ${resultado.parentesco || 'No detectado'} - Familiar: ${resultado.esFamiliar ? 'SÍ' : 'NO'}`);

      await context.close();
      await browser.close();
      return resultado;

    } catch (error) {
      console.error(`[EJZAGETRO] Error en validación de DNI ${dni}: ${error.message}`);
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Valida múltiples DNIs en batch
   * @param {string[]} dnis - Array de DNIs a validar
   * @returns {Promise<Object[]>} Resultados de todas las validaciones
   */
  async validarMultiplesDNIs(dnis) {
    const resultados = [];

    for (const dni of dnis) {
      try {
        const resultado = await this.buscarDNI(dni);
        resultados.push(resultado);

        // Esperar entre consultas para evitar bloqueos (reducido de 2s a 800ms)
        await this.sleep(800);
      } catch (error) {
        console.error(`Error validando DNI ${dni}:`, error.message);
        resultados.push({
          dni,
          error: true,
          mensaje: error.message
        });
      }
    }

    return resultados;
  }

  /**
   * Función auxiliar para pausar la ejecución
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EjzagetroScraper;
