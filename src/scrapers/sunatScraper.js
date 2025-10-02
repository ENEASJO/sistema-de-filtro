const puppeteer = require('puppeteer');

/**
 * Scraper para SUNAT - Obtiene información de RUC y DNIs de representantes
 */
class SunatScraper {
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
    let representantesPage;
    try {
      console.log(`[SUNAT] Iniciando búsqueda para RUC: ${ruc}`);

      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 30000
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      console.log('[SUNAT] Navegando a la página...');
      await page.goto(this.url, { waitUntil: 'networkidle2', timeout: 30000 });

      console.log('[SUNAT] Esperando selector de input...');
      // Esperar a que cargue el input y botón
      await page.waitForSelector('input[placeholder*="Ingrese RUC"]', { timeout: 10000 });

      console.log('[SUNAT] Ingresando RUC...');
      // Ingresar RUC en el formulario
      await page.type('input[placeholder*="Ingrese RUC"]', ruc);

      console.log('[SUNAT] Haciendo clic en Buscar...');
      // Hacer clic en el botón "Buscar"
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(btn => btn.textContent.includes('Buscar'));
          if (btn) btn.click();
        })
      ]);

      console.log('[SUNAT] Navegación completada, extrayendo datos...');

      // Extraer información básica de la empresa
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

        // Extraer razón social y RUC del segundo h4 (contiene RUC - Razón Social)
        const headings = document.querySelectorAll('h4');
        if (headings.length >= 2) {
          const rucHeading = headings[1]; // "20131312955 - SUPERINTENDENCIA..."
          if (rucHeading && rucHeading.textContent.includes('-')) {
            const partes = rucHeading.textContent.split('-');
            if (partes.length >= 2) {
              resultado.ruc = partes[0].trim();
              resultado.razonSocial = partes.slice(1).join('-').trim();
            }
          }
        }

        // Extraer otros datos buscando por texto
        headings.forEach((h, index) => {
          const text = h.textContent;

          if (text.includes('Tipo Contribuyente:')) {
            // El siguiente elemento es el valor
            const nextH = headings[index + 1];
            if (nextH && !nextH.textContent.includes(':')) {
              resultado.tipo = nextH.textContent.trim();
            }
          } else if (text.includes('Estado del Contribuyente:')) {
            const nextH = headings[index + 1];
            if (nextH && !nextH.textContent.includes(':')) {
              resultado.estado = nextH.textContent.trim();
            }
          } else if (text.includes('Condición del Contribuyente:')) {
            const nextH = headings[index + 1];
            if (nextH && !nextH.textContent.includes(':')) {
              resultado.condicion = nextH.textContent.trim();
            }
          } else if (text.includes('Domicilio Fiscal:')) {
            const nextH = headings[index + 1];
            if (nextH && !nextH.textContent.includes(':')) {
              resultado.direccion = nextH.textContent.trim();
            }
          }
        });

        return resultado;
      });

      console.log('[SUNAT] Buscando botón de representantes...');
      // Buscar el botón de representantes legales
      const hasRepresentantes = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => btn.textContent.includes('Representante'));
      });

      console.log(`[SUNAT] Botón de representantes encontrado: ${hasRepresentantes}`);

      if (hasRepresentantes) {
        console.log('[SUNAT] Modificando formulario para abrir en la misma ventana...');

        // Configurar el formulario para que se abra en un popup detectable
        await page.evaluate(() => {
          const form = document.formRepLeg;
          if (form) {
            // Configurar target="_blank" para que abra en nueva pestaña
            form.target = '_blank';
          }
        });

        console.log('[SUNAT] Disparando click en botón de representantes...');

        // Preparar listener para nueva página
        const newPagePromise = new Promise(resolve => {
          browser.once('targetcreated', async target => {
            const newPage = await target.page();
            resolve(newPage);
          });

          // Timeout de 5 segundos
          setTimeout(() => resolve(null), 5000);
        });

        // Hacer clic en el botón
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(btn => btn.textContent.includes('Representante'));
          if (btn) btn.click();
        });

        // Esperar la nueva página
        representantesPage = await newPagePromise;

        if (representantesPage) {
          console.log('[SUNAT] Nueva página detectada, esperando contenido...');

          // Esperar a que la página esté completamente cargada
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Verificar si hay tabla
          const hasTable = await representantesPage.$('table').catch(() => null);
          console.log(`[SUNAT] Tabla encontrada: ${hasTable !== null}`);

          if (hasTable) {
            console.log('[SUNAT] Extrayendo DNIs de la tabla...');
            const dnisRepresentantes = await representantesPage.evaluate(() => {
              const dnis = [];

              // Buscar todos los textos que parezcan DNI (8 dígitos)
              const bodyText = document.body.innerText;
              const dniMatches = bodyText.match(/\b\d{8}\b/g) || [];

              // También intentar extraer de celdas de tabla específicamente
              const rows = document.querySelectorAll('table tr');
              rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                cells.forEach(cell => {
                  const text = cell.textContent.trim();
                  if (/^\d{8}$/.test(text)) {
                    dnis.push(text);
                  }
                });
              });

              // Combinar resultados
              return [...new Set([...dnis, ...dniMatches])];
            });

            datos.dnis = [...new Set(dnisRepresentantes)];
            console.log(`[SUNAT] DNIs extraídos: ${datos.dnis.join(', ')}`);
          } else {
            console.log('[SUNAT] No se encontró tabla en la página de representantes');
          }

          await representantesPage.close();
        } else {
          console.log('[SUNAT] No se pudo abrir página de representantes');
        }
      }

      console.log(`[SUNAT] Encontrados ${datos.dnis.length} DNIs para RUC ${ruc}`);
      console.log(`[SUNAT] Razón Social: ${datos.razonSocial}`);

      await browser.close();
      return datos;

    } catch (error) {
      console.error(`[SUNAT] Error en búsqueda: ${error.message}`);
      if (representantesPage) await representantesPage.close().catch(() => {});
      if (browser) await browser.close();
      throw error;
    }
  }
}

module.exports = SunatScraper;
