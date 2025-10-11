const EjzagetroScraper = require('../scrapers/ejzagetroScraper');

/**
 * Servicio para comparar múltiples DNIs y detectar vínculos familiares
 */
class ComparacionDNIService {
  constructor() {
    this.ejzagetroScraper = new EjzagetroScraper();
  }

  /**
   * Compara una lista de DNIs y detecta vínculos familiares entre ellos
   * @param {Array<string>} dnis - Array de DNIs a comparar (8 dígitos cada uno)
   * @returns {Object} Resultado de la comparación con vínculos detectados
   */
  async compararDNIs(dnis) {
    console.log(`\n🔍 Iniciando comparación de ${dnis.length} DNIs...`);

    const resultado = {
      timestamp: new Date().toISOString(),
      totalDNIs: dnis.length,
      dnisValidados: [],
      vinculosEncontrados: [],
      resumen: {
        totalVinculos: 0,
        dnisConVinculos: 0,
        dnisSinVinculos: 0,
        dnisSinDatos: 0
      }
    };

    // Validar cada DNI en ejzagetro
    console.log('\n📋 Validando DNIs en ejzagetro.com...');
    for (const dni of dnis) {
      console.log(`\n   Validando DNI: ${dni}`);

      const validacion = await this.ejzagetroScraper.buscarDNI(dni);

      resultado.dnisValidados.push({
        dni,
        encontrado: validacion.encontrado,
        esFamiliar: validacion.esFamiliar,
        nombrePersona: validacion.nombrePersona || null,
        parentesco: validacion.parentesco || null,
        nombreFamiliar: validacion.nombreFamiliar || null,
        dniFamiliar: validacion.dniFamiliar || null
      });

      // Log de resultado
      if (validacion.encontrado && validacion.esFamiliar) {
        console.log(`   ✅ DNI ${dni} ENCONTRADO - Es familiar de: ${validacion.nombreFamiliar} (${validacion.dniFamiliar})`);
      } else if (validacion.encontrado) {
        console.log(`   ⚠️  DNI ${dni} encontrado pero sin familiares registrados`);
      } else {
        console.log(`   ℹ️  DNI ${dni} no encontrado en el sistema`);
      }
    }

    // Analizar vínculos entre los DNIs proporcionados
    console.log('\n🔗 Analizando vínculos entre DNIs...');
    resultado.vinculosEncontrados = this.detectarVinculos(resultado.dnisValidados, dnis);

    // Calcular resumen
    resultado.resumen.totalVinculos = resultado.vinculosEncontrados.length;

    const dnisConVinculosSet = new Set();
    resultado.vinculosEncontrados.forEach(vinculo => {
      dnisConVinculosSet.add(vinculo.dni1);
      dnisConVinculosSet.add(vinculo.dni2);
    });
    resultado.resumen.dnisConVinculos = dnisConVinculosSet.size;

    resultado.resumen.dnisSinDatos = resultado.dnisValidados.filter(v => !v.encontrado).length;
    resultado.resumen.dnisSinVinculos = resultado.totalDNIs - resultado.resumen.dnisConVinculos - resultado.resumen.dnisSinDatos;

    // Log final
    console.log('\n📊 RESUMEN DE COMPARACIÓN:');
    console.log(`   Total DNIs analizados: ${resultado.totalDNIs}`);
    console.log(`   DNIs con vínculos familiares: ${resultado.resumen.dnisConVinculos}`);
    console.log(`   DNIs sin vínculos: ${resultado.resumen.dnisSinVinculos}`);
    console.log(`   DNIs sin datos: ${resultado.resumen.dnisSinDatos}`);
    console.log(`   Total de vínculos detectados: ${resultado.resumen.totalVinculos}`);

    if (resultado.vinculosEncontrados.length > 0) {
      console.log('\n⚠️  VÍNCULOS FAMILIARES DETECTADOS:');
      resultado.vinculosEncontrados.forEach((vinculo, index) => {
        console.log(`   ${index + 1}. ${vinculo.nombre1} (${vinculo.dni1}) ↔ ${vinculo.nombre2} (${vinculo.dni2})`);
        console.log(`      Relación: ${vinculo.tipoRelacion}`);
      });
    } else {
      console.log('\n✅ No se detectaron vínculos familiares entre los DNIs');
    }

    return resultado;
  }

  /**
   * Detecta vínculos familiares entre DNIs validados
   * @param {Array} dnisValidados - DNIs ya validados con ejzagetro
   * @param {Array} dnisList - Lista original de DNIs
   * @returns {Array} Lista de vínculos detectados
   */
  detectarVinculos(dnisValidados, dnisList) {
    const vinculos = [];

    // Crear un mapa de DNI -> datos para búsqueda rápida
    const dniMap = {};
    dnisValidados.forEach(validacion => {
      dniMap[validacion.dni] = validacion;
    });

    // Comparar cada DNI con los demás
    for (let i = 0; i < dnisValidados.length; i++) {
      const persona1 = dnisValidados[i];

      // Si esta persona no tiene datos de familiar, continuar
      if (!persona1.encontrado || !persona1.esFamiliar) {
        continue;
      }

      // Verificar si el DNI del familiar está en nuestra lista
      if (persona1.dniFamiliar && dnisList.includes(persona1.dniFamiliar)) {
        const persona2 = dniMap[persona1.dniFamiliar];

        // Evitar duplicados (A->B y B->A)
        const vinculoExiste = vinculos.some(v =>
          (v.dni1 === persona1.dni && v.dni2 === persona1.dniFamiliar) ||
          (v.dni1 === persona1.dniFamiliar && v.dni2 === persona1.dni)
        );

        if (!vinculoExiste) {
          vinculos.push({
            dni1: persona1.dni,
            nombre1: persona1.nombrePersona || 'Nombre no disponible',
            dni2: persona1.dniFamiliar,
            nombre2: persona1.nombreFamiliar || persona2?.nombrePersona || 'Nombre no disponible',
            tipoRelacion: persona1.parentesco || 'Familiar',
            direccion: `${persona1.dni} es ${persona1.parentesco || 'familiar de'} ${persona1.dniFamiliar}`
          });
        }
      }
    }

    return vinculos;
  }

  /**
   * Genera un reporte visual de la comparación
   * @param {Object} resultado - Resultado de comparación
   * @returns {Object} Reporte formateado
   */
  generarReporte(resultado) {
    const dnisConVinculos = new Set();
    resultado.vinculosEncontrados.forEach(vinculo => {
      dnisConVinculos.add(vinculo.dni1);
      dnisConVinculos.add(vinculo.dni2);
    });

    return {
      hayVinculos: resultado.vinculosEncontrados.length > 0,
      totalDNIs: resultado.totalDNIs,
      totalVinculos: resultado.vinculosEncontrados.length,
      dnisConVinculos: Array.from(dnisConVinculos),
      dnisSinVinculos: resultado.dnisValidados
        .filter(v => v.encontrado && !dnisConVinculos.has(v.dni))
        .map(v => v.dni),
      dnisSinDatos: resultado.dnisValidados
        .filter(v => !v.encontrado)
        .map(v => v.dni),
      vinculos: resultado.vinculosEncontrados,
      mensaje: resultado.vinculosEncontrados.length > 0
        ? `⚠️ Se encontraron ${resultado.vinculosEncontrados.length} vínculo(s) familiar(es) entre los DNIs`
        : '✅ No se encontraron vínculos familiares entre los DNIs',
      timestamp: resultado.timestamp
    };
  }
}

module.exports = ComparacionDNIService;
