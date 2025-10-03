// Limpiar caché de módulos para asegurar que se usen las últimas versiones
delete require.cache[require.resolve('../scrapers/sunatScraperPlaywright')];
delete require.cache[require.resolve('../scrapers/osceScraper')];
delete require.cache[require.resolve('../scrapers/ejzagetroScraper')];

const SunatScraper = require('../scrapers/sunatScraperPlaywright');
const OsceScraper = require('../scrapers/osceScraper');
const EjzagetroScraper = require('../scrapers/ejzagetroScraper');
const formatearNombre = require('../utils/formatNombre');

/**
 * Servicio principal de filtrado de RUCs y validación de DNIs
 */
class FiltroService {
  constructor() {
    this.sunatScraper = new SunatScraper();
    this.osceScraper = new OsceScraper();
    this.ejzagetroScraper = new EjzagetroScraper();
  }

  /**
   * Valida el formato del RUC
   * @param {string} ruc - Número de RUC a validar
   * @returns {Object} {valido: boolean, mensaje: string}
   */
  validarFormatoRUC(ruc) {
    // RUC debe tener 11 dígitos
    if (!ruc || typeof ruc !== 'string') {
      return { valido: false, mensaje: 'El RUC es requerido' };
    }

    const rucLimpio = ruc.trim();

    if (!/^\d{11}$/.test(rucLimpio)) {
      return { valido: false, mensaje: 'El RUC debe tener exactamente 11 dígitos numéricos' };
    }

    // Validar que comience con 10, 15, 17, o 20 (tipos válidos de RUC)
    const prefijo = rucLimpio.substring(0, 2);
    if (!['10', '15', '17', '20'].includes(prefijo)) {
      return { valido: false, mensaje: 'El RUC debe comenzar con 10, 15, 17, o 20' };
    }

    return { valido: true, mensaje: '' };
  }

  /**
   * Procesa un RUC completo: extrae DNIs y valida familiares
   * @param {string} ruc - Número de RUC a procesar
   * @returns {Promise<Object>} Resultado completo del filtrado
   */
  async procesarRUC(ruc) {
    console.log(`\n========================================`);
    console.log(`Procesando RUC: ${ruc}`);
    console.log(`========================================\n`);

    const resultado = {
      ruc,
      timestamp: new Date().toISOString(),
      aprobado: true,
      razonSocial: '',
      dnisTotales: [],
      dnisConFamiliares: [],
      dnisAprobados: [],
      motivoRechazo: null,
      detallesSunat: null,
      detallesOsce: null,
      validacionesDNI: [],
      personasDetalladas: [] // Nueva propiedad para datos completos
    };

    try {
      // Validación temprana del formato RUC
      const validacion = this.validarFormatoRUC(ruc);
      if (!validacion.valido) {
        console.log(`❌ RUC inválido: ${validacion.mensaje}`);
        resultado.aprobado = false;
        resultado.motivoRechazo = validacion.mensaje;
        return resultado;
      }
      // Paso 1 y 2: Obtener DNIs desde SUNAT y OSCE en paralelo
      console.log('Paso 1-2: Consultando SUNAT y OSCE en paralelo...');
      const [datosSunat, datosOsce] = await Promise.allSettled([
        this.sunatScraper.buscarPorRUC(ruc),
        this.osceScraper.buscarPorRUC(ruc)
      ]);

      // Procesar resultados de SUNAT
      if (datosSunat.status === 'fulfilled') {
        resultado.detallesSunat = datosSunat.value;
        resultado.razonSocial = datosSunat.value.razonSocial;
        resultado.dnisTotales.push(...datosSunat.value.dnis);
      } else {
        console.warn(`Advertencia SUNAT: ${datosSunat.reason.message}`);
      }

      // Procesar resultados de OSCE
      if (datosOsce.status === 'fulfilled') {
        resultado.detallesOsce = datosOsce.value;
        if (!resultado.razonSocial) {
          resultado.razonSocial = datosOsce.value.razonSocial;
        }
        // Agregar DNIs únicos
        datosOsce.value.dnis.forEach(dni => {
          if (!resultado.dnisTotales.includes(dni)) {
            resultado.dnisTotales.push(dni);
          }
        });
      } else {
        console.warn(`Advertencia OSCE: ${datosOsce.reason.message}`);
      }

      // Verificar si se encontraron DNIs
      if (resultado.dnisTotales.length === 0) {
        resultado.aprobado = false;
        resultado.motivoRechazo = 'RUC no encontrado o no registrado en SUNAT/OSCE';
        return resultado;
      }

      console.log(`\nDNIs encontrados: ${resultado.dnisTotales.length}`);
      console.log(`DNIs: ${resultado.dnisTotales.join(', ')}\n`);

      // Construir personasDetalladas con información de fuente
      const personasMap = new Map();

      // Agregar DNIs de SUNAT con nombres
      if (resultado.detallesSunat && resultado.detallesSunat.representantes) {
        resultado.detallesSunat.representantes.forEach(rep => {
          personasMap.set(rep.dni, {
            dni: rep.dni,
            nombre: rep.nombre ? formatearNombre(rep.nombre) : rep.nombre,
            fuentes: ['SUNAT'],
            razonSocial: resultado.detallesSunat.razonSocial || ''
          });
        });
      }

      // Agregar DNIs de OSCE con nombres
      if (resultado.detallesOsce && resultado.detallesOsce.representantes) {
        resultado.detallesOsce.representantes.forEach(rep => {
          if (personasMap.has(rep.dni)) {
            personasMap.get(rep.dni).fuentes.push('OSCE');
            // Si OSCE tiene nombre y SUNAT no, usar el de OSCE
            if (!personasMap.get(rep.dni).nombre && rep.nombre) {
              personasMap.get(rep.dni).nombre = formatearNombre(rep.nombre);
            }
          } else {
            personasMap.set(rep.dni, {
              dni: rep.dni,
              nombre: rep.nombre ? formatearNombre(rep.nombre) : rep.nombre,
              fuentes: ['OSCE'],
              razonSocial: resultado.detallesOsce.razonSocial || ''
            });
          }
        });
      }

      resultado.personasDetalladas = Array.from(personasMap.values());

      // Paso 3: Validar cada DNI en ejzagetro.com
      console.log('Paso 3: Validando DNIs en ejzagetro.com...');
      resultado.validacionesDNI = await this.ejzagetroScraper.validarMultiplesDNIs(resultado.dnisTotales);

      // Paso 4: Analizar resultados y determinar aprobación
      resultado.validacionesDNI.forEach(validacion => {
        // Agregar información de validación a personasDetalladas
        const persona = resultado.personasDetalladas.find(p => p.dni === validacion.dni);
        if (persona) {
          persona.esFamiliar = validacion.esFamiliar;
          persona.encontrado = validacion.encontrado;
          persona.nombrePersona = validacion.nombrePersona;
        }

        if (validacion.esFamiliar) {
          resultado.dnisConFamiliares.push(validacion.dni);
        } else {
          resultado.dnisAprobados.push(validacion.dni);
        }
      });

      // Determinar si se aprueba el pago
      if (resultado.dnisConFamiliares.length > 0) {
        resultado.aprobado = false;
        resultado.motivoRechazo = `Se encontraron ${resultado.dnisConFamiliares.length} DNI(s) con familiares registrados`;
      } else {
        resultado.aprobado = true;
      }

      console.log(`\n========================================`);
      console.log(`Resultado: ${resultado.aprobado ? 'APROBADO ✓' : 'RECHAZADO ✗'}`);
      if (!resultado.aprobado) {
        console.log(`Motivo: ${resultado.motivoRechazo}`);
        console.log(`DNIs rechazados: ${resultado.dnisConFamiliares.join(', ')}`);
      }
      console.log(`========================================\n`);

      return resultado;

    } catch (error) {
      console.error(`Error procesando RUC ${ruc}:`, error);
      resultado.aprobado = false;
      resultado.motivoRechazo = `Error en el procesamiento: ${error.message}`;
      return resultado;
    }
  }

  /**
   * Procesa múltiples RUCs en batch
   * @param {string[]} rucs - Array de RUCs a procesar
   * @returns {Promise<Object[]>} Resultados de todos los RUCs
   */
  async procesarMultiplesRUCs(rucs) {
    const resultados = [];

    for (const ruc of rucs) {
      try {
        const resultado = await this.procesarRUC(ruc);
        resultados.push(resultado);
      } catch (error) {
        console.error(`Error procesando RUC ${ruc}:`, error);
        resultados.push({
          ruc,
          error: true,
          mensaje: error.message
        });
      }
    }

    return resultados;
  }

  /**
   * Genera un reporte resumido de los resultados
   * @param {Object[]} resultados - Array de resultados
   * @returns {Object} Reporte resumido
   */
  generarReporte(resultados) {
    const reporte = {
      totalProcesados: resultados.length,
      aprobados: 0,
      rechazados: 0,
      errores: 0,
      detalleRechazos: []
    };

    resultados.forEach(resultado => {
      if (resultado.error) {
        reporte.errores++;
      } else if (resultado.aprobado) {
        reporte.aprobados++;
      } else {
        reporte.rechazados++;
        reporte.detalleRechazos.push({
          ruc: resultado.ruc,
          razonSocial: resultado.razonSocial,
          motivo: resultado.motivoRechazo,
          dnisConFamiliares: resultado.dnisConFamiliares
        });
      }
    });

    return reporte;
  }
}

module.exports = FiltroService;
