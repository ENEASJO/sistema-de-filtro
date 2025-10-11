const { chromium } = require('playwright');
const formatearNombre = require('../utils/formatNombre');

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
      await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 45000 });

      console.log('[EJZAGETRO] Ingresando DNI...');
      // Esperar input y llenar
      await page.waitForSelector('input[type="text"]', { timeout: 10000 });
      await page.fill('input[type="text"]', dni);

      console.log('[EJZAGETRO] Haciendo clic en Buscar...');
      await page.click('button:has-text("Buscar")');

      // Esperar resultados o mensaje de error (más rápido que timeout fijo)
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      // Esperar a que aparezca la tabla de resultados o algún contenido
      console.log('[EJZAGETRO] Esperando respuesta...');
      try {
        await page.waitForSelector('table.table-bordered', { timeout: 10000 });
      } catch (error) {
        // Si no aparece la tabla, el DNI probablemente no existe
        console.log('[EJZAGETRO] No se encontró tabla de resultados - DNI posiblemente no registrado');
      }

      // Extraer resultados
      const resultado = await page.evaluate(() => {
        const data = {
          dni: '',
          encontrado: false,
          esFamiliar: false,
          nombrePersona: '',
          nombreFamiliar: '',
          dniFamiliar: '',
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

        // Usar selectores DOM para extraer datos de la tabla
        const filas = document.querySelectorAll('table.table-bordered tr');

        filas.forEach(fila => {
          const celdas = fila.querySelectorAll('td, th');
          if (celdas.length >= 2) {
            const etiqueta = celdas[0].textContent.trim().toUpperCase();
            const valor = celdas[1].textContent.trim();

            if (etiqueta === 'NOMBRES') {
              data.nombrePersona = valor;
            } else if (etiqueta === 'PARENTESCO') {
              data.parentesco = valor.toUpperCase();

              // Si parentesco es diferente de "NINGUNO", entonces SÍ tiene familiares
              if (data.parentesco !== 'NINGUNO') {
                data.esFamiliar = true;
              }
            }
          }
        });

        // Si es familiar, intentar extraer más información del texto
        if (data.esFamiliar) {
          // Intentar extraer el nombre del familiar (puede aparecer después de PARENTESCO)
          // Buscar "CON:" o patrones similares que indiquen el nombre del familiar
          const conMatch = textoCompleto.match(/CON[:\s]+([\w\s,áéíóúÁÉÍÓÚñÑ]+)/i);
          if (conMatch) {
            data.nombreFamiliar = conMatch[1].trim().split('\n')[0].trim();
          }

          // Intentar extraer DNI del familiar
          // Buscar patrón de 8 dígitos que no sea el DNI buscado
          const dniMatches = textoCompleto.match(/\b\d{8}\b/g);
          if (dniMatches && dniMatches.length > 1) {
            // El segundo DNI suele ser el del familiar
            data.dniFamiliar = dniMatches[1];
          }
        }

        // Capturar detalles adicionales
        data.detalles = textoCompleto.trim();

        return data;
      });

      resultado.dni = dni;

      // Formatear nombres si existen
      if (resultado.nombrePersona) {
        resultado.nombrePersona = formatearNombre(resultado.nombrePersona);
      }
      if (resultado.nombreFamiliar) {
        resultado.nombreFamiliar = formatearNombre(resultado.nombreFamiliar);
      }

      console.log(`[EJZAGETRO] DNI ${dni} - Nombre: ${resultado.nombrePersona || 'No detectado'} - Parentesco: ${resultado.parentesco || 'No detectado'} - Familiar: ${resultado.esFamiliar ? 'SÍ' : 'NO'}`);
      if (resultado.esFamiliar && resultado.nombreFamiliar) {
        console.log(`[EJZAGETRO]    └─ Familiar: ${resultado.nombreFamiliar} (${resultado.dniFamiliar || 'DNI no detectado'})`);
      }

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

        // Esperar entre consultas para evitar bloqueos (optimizado a 500ms)
        await this.sleep(500);
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
