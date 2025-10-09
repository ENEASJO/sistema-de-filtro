const { chromium } = require('playwright');
const formatearNombre = require('../utils/formatNombre');

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
      await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);

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

        // Método 1: Buscar DNIs con formato "D.N.I. - 12345678" o "DNI - 12345678"
        const dniPattern1 = /(?:D\.N\.I\.|DNI)[:\s\-]*(\d{8})/gi;
        let match;
        const dnisEncontrados = new Map(); // Usar Map para evitar duplicados y guardar contexto

        while ((match = dniPattern1.exec(textoCompleto)) !== null) {
          const dni = match[1];

          // Validar que el DNI no sea parte de un RUC
          const esProbableRUC = dni.startsWith('20') || dni.startsWith('10') ||
                                 dni.startsWith('15') || dni.startsWith('17');

          if (!esProbableRUC && !dnisEncontrados.has(dni)) {
            dnisEncontrados.set(dni, { dni, nombre: '' });
          }
        }

        // Método 2: Buscar en tablas (más confiable)
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            const rowText = cells.map(c => c.innerText.trim()).join(' | ');

            // Buscar patrones de DNI en la fila
            const dniInRow = rowText.match(/(\d{8})/g);
            if (dniInRow) {
              dniInRow.forEach(dni => {
                // Validar formato de DNI (8 dígitos, no empieza con 10,15,17,20)
                if (dni.length === 8 &&
                    !dni.startsWith('20') &&
                    !dni.startsWith('10') &&
                    !dni.startsWith('15') &&
                    !dni.startsWith('17')) {

                  // Buscar nombre en la misma fila
                  let nombre = '';
                  cells.forEach(cell => {
                    const text = cell.innerText.trim();
                    // Si la celda tiene más de 10 caracteres y contiene letras, probablemente sea un nombre
                    if (text.length > 10 && /[A-ZÁÉÍÓÚÑa-záéíóúñ]{3,}/.test(text) &&
                        !text.includes(dni) && !text.match(/\d{8,}/)) {
                      nombre = text;
                    }
                  });

                  if (!dnisEncontrados.has(dni)) {
                    dnisEncontrados.set(dni, { dni, nombre });
                  } else if (nombre && !dnisEncontrados.get(dni).nombre) {
                    dnisEncontrados.get(dni).nombre = nombre;
                  }
                }
              });
            }
          });
        });

        // Método 3: Buscar en el texto completo por líneas
        const lineas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (let i = 0; i < lineas.length; i++) {
          const linea = lineas[i];

          // Buscar DNIs sueltos (8 dígitos consecutivos)
          const dnisSueltos = linea.match(/\b(\d{8})\b/g);
          if (dnisSueltos) {
            dnisSueltos.forEach(dni => {
              const esProbableRUC = dni.startsWith('20') || dni.startsWith('10') ||
                                     dni.startsWith('15') || dni.startsWith('17');

              if (!esProbableRUC && !dnisEncontrados.has(dni)) {
                // Buscar nombre en líneas cercanas
                let nombre = '';
                for (let j = Math.max(0, i - 3); j <= Math.min(lineas.length - 1, i + 3); j++) {
                  if (j !== i && lineas[j].length > 10 &&
                      /[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{10,}/.test(lineas[j]) &&
                      !lineas[j].match(/\d{8,}/)) {
                    nombre = lineas[j];
                    break;
                  }
                }
                dnisEncontrados.set(dni, { dni, nombre });
              }
            });
          }
        }

        // Convertir Map a array y limpiar nombres
        dnisEncontrados.forEach((data) => {
          let nombreLimpio = data.nombre || '';

          // Limpiar el nombre de caracteres extraños
          nombreLimpio = nombreLimpio
            .replace(/\s+/g, ' ')  // Normalizar espacios
            .replace(/[^\w\sÁÉÍÓÚÑáéíóúñ]/g, ' ')  // Quitar caracteres especiales
            .trim();

          // Si el nombre tiene menos de 5 caracteres, no es válido
          if (nombreLimpio.length < 5) {
            nombreLimpio = '';
          }

          resultado.representantes.push({
            dni: data.dni,
            nombre: nombreLimpio || 'Nombre no encontrado'
          });
          resultado.dnis.push(data.dni);
        });

        // Eliminar duplicados de DNIs
        resultado.dnis = [...new Set(resultado.dnis)];

        // Extraer razón social (mejorado)
        const h1 = document.querySelector('h1, h2, .title, .nombre-empresa');
        if (h1) {
          resultado.razonSocial = h1.innerText.trim();
        } else {
          // Buscar en las primeras líneas
          for (const linea of lineas.slice(0, 10)) {
            if (linea.length > 15 && linea.length < 200 &&
                !linea.includes('RUC') &&
                !linea.includes('Vigentes') &&
                !linea.match(/\d{11}/) &&
                /[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{10,}/.test(linea)) {
              resultado.razonSocial = linea;
              break;
            }
          }
        }

        return resultado;
      });

      // Formatear nombres de representantes
      if (datos.representantes && datos.representantes.length > 0) {
        datos.representantes = datos.representantes.map(rep => ({
          ...rep,
          nombre: rep.nombre ? formatearNombre(rep.nombre) : rep.nombre
        }));
      }

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
