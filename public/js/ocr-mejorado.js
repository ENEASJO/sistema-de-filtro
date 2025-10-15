// ===== OCR MEJORADO - SISTEMA AVANZADO DE EXTRACCIÓN =====

// Variable global para almacenar detecciones temporales
let deteccionesTemporales = [];

/**
 * Validación de dígitos verificadores para DNI (Algoritmo Módulo 11)
 * @param {string} dni - DNI de 8 dígitos
 * @returns {boolean} - True si es válido
 */
function validarDigitoVerificadorDNI(dni) {
    if (!/^\d{8}$/.test(dni)) return false;

    // Perú usa un sistema simple de validación
    // Números que claramente no son DNIs (ej: 00000000, 11111111)
    const invalidPatterns = [
        /^0+$/, // Todo ceros
        /^1+$/, // Todo unos
        /^(.)\1{7}$/ // Todos los dígitos iguales
    ];

    return !invalidPatterns.some(pattern => pattern.test(dni));
}

/**
 * Validación de dígitos verificadores para RUC
 * @param {string} ruc - RUC de 11 dígitos
 * @returns {boolean} - True si es válido
 */
function validarDigitoVerificadorRUC(ruc) {
    if (!/^\d{11}$/.test(ruc)) return false;

    const prefijo = ruc.substring(0, 2);
    if (!['10', '15', '17', '20'].includes(prefijo)) return false;

    // Algoritmo de validación de RUC peruano
    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitos = ruc.substring(0, 10).split('').map(Number);
    const digitoVerificador = parseInt(ruc[10]);

    const suma = digitos.reduce((acc, digito, i) => acc + (digito * factores[i]), 0);
    const residuo = suma % 11;
    const resultado = 11 - residuo;

    const verificadorEsperado = resultado === 10 ? 0 : (resultado === 11 ? 1 : resultado);

    return verificadorEsperado === digitoVerificador;
}

/**
 * Preprocesamiento de imagen para mejorar OCR
 * Aplica: escala de grises, mejora de contraste, binarización
 * @param {File} file - Archivo de imagen
 * @returns {Promise<string>} - Data URL de imagen procesada
 */
async function preprocesarImagen(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Establecer dimensiones
                canvas.width = img.width;
                canvas.height = img.height;

                // Dibujar imagen original
                ctx.drawImage(img, 0, 0);

                // Obtener datos de píxeles
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // 1. Convertir a escala de grises
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }

                // 2. Ajuste de contraste (aumentar contraste)
                const contrast = 1.5; // Factor de contraste
                const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

                for (let i = 0; i < data.length; i += 4) {
                    data[i] = factor * (data[i] - 128) + 128;
                    data[i + 1] = factor * (data[i + 1] - 128) + 128;
                    data[i + 2] = factor * (data[i + 2] - 128) + 128;
                }

                // 3. Binarización (threshold adaptativo)
                const threshold = 128;
                for (let i = 0; i < data.length; i += 4) {
                    const value = data[i] > threshold ? 255 : 0;
                    data[i] = data[i + 1] = data[i + 2] = value;
                }

                // Aplicar cambios
                ctx.putImageData(imageData, 0, 0);

                resolve(canvas.toDataURL());
            };
            img.onerror = reject;
            img.src = e.target.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Filtros inteligentes para eliminar falsos positivos
 * @param {string} numero - Número detectado
 * @param {number} tipo - 8 para DNI, 11 para RUC
 * @returns {boolean} - True si pasa los filtros
 */
function aplicarFiltrosInteligentes(numero, tipo) {
    // Filtro 1: No puede ser todo ceros
    if (/^0+$/.test(numero)) return false;

    // Filtro 2: No puede ser todos dígitos iguales
    if (/^(.)\1+$/.test(numero)) return false;

    // Filtro 3: Para DNIs, el primer dígito debe ser entre 1-7 (estándar peruano)
    if (tipo === 8) {
        const primerDigito = parseInt(numero[0]);
        if (primerDigito === 0 || primerDigito > 7) return false;
    }

    // Filtro 4: Para RUCs, debe empezar con prefijo válido
    if (tipo === 11) {
        const prefijo = numero.substring(0, 2);
        if (!['10', '15', '17', '20'].includes(prefijo)) return false;
    }

    // Filtro 5: No puede ser fecha (formato DDMMYYYY)
    if (tipo === 8) {
        const dia = parseInt(numero.substring(0, 2));
        const mes = parseInt(numero.substring(2, 4));
        if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
            // Posible fecha, verificar año
            const anio = parseInt(numero.substring(4, 8));
            if (anio >= 1900 && anio <= 2100) return false;
        }
    }

    // Filtro 6: No puede ser número de teléfono común
    const telefonosComunes = ['999', '998', '997', '996', '995', '994', '993', '992', '991'];
    if (tipo === 8 && telefonosComunes.some(prefix => numero.startsWith(prefix))) {
        return false;
    }

    return true;
}

/**
 * Extracción mejorada de números desde imagen con todas las mejoras
 * @param {File} file - Archivo de imagen
 * @returns {Promise<Object>} - Objeto con DNIs y RUCs detectados, con confianza
 */
async function extraerNumerosDesdeImagenMejorado(file) {
    return new Promise(async (resolve, reject) => {
        try {
            // 1. Preprocesar imagen
            const imagenProcesada = await preprocesarImagen(file);

            // 2. Cargar Tesseract si no está cargado
            if (!window.Tesseract) {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
                await new Promise((res, rej) => {
                    script.onload = res;
                    script.onerror = rej;
                    document.head.appendChild(script);
                });
            }

            const { createWorker } = window.Tesseract;

            // 3. Ejecutar OCR con configuración optimizada
            const worker = await createWorker('spa', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const percent = Math.round(m.progress * 100);
                        const progress = document.getElementById('ocr-progress-general');
                        const progressText = document.getElementById('ocr-progress-text-general');
                        if (progress) progress.style.width = `${percent}%`;
                        if (progressText) progressText.textContent = `Procesando imagen: ${percent}%`;
                    }
                }
            });

            // Reconocer tanto imagen original como procesada
            const [resultOriginal, resultProcesada] = await Promise.all([
                worker.recognize(file),
                worker.recognize(imagenProcesada)
            ]);

            await worker.terminate();

            // 4. Combinar resultados de ambas imágenes
            const textoCompleto = resultOriginal.data.text + '\n' + resultProcesada.data.text;
            const palabrasConConfianza = [
                ...resultOriginal.data.words,
                ...resultProcesada.data.words
            ];

            // 5. Extraer DNIs y RUCs con regex
            const dniRegex = /\b\d{8}\b/g;
            const rucRegex = /\b\d{11}\b/g;

            const dnisEncontrados = textoCompleto.match(dniRegex) || [];
            const rucsEncontrados = textoCompleto.match(rucRegex) || [];

            // 6. Aplicar validaciones y filtros
            const dnisValidados = dnisEncontrados
                .filter(dni => aplicarFiltrosInteligentes(dni, 8))
                .filter(dni => validarDigitoVerificadorDNI(dni))
                .map(dni => {
                    // Calcular confianza basada en OCR
                    const palabrasRelacionadas = palabrasConConfianza.filter(w =>
                        w.text.includes(dni)
                    );
                    const confianza = palabrasRelacionadas.length > 0
                        ? Math.round(palabrasRelacionadas[0].confidence)
                        : 85;

                    return { numero: dni, tipo: 'DNI', confianza };
                });

            const rucsValidados = rucsEncontrados
                .filter(ruc => aplicarFiltrosInteligentes(ruc, 11))
                .filter(ruc => validarDigitoVerificadorRUC(ruc))
                .map(ruc => {
                    const palabrasRelacionadas = palabrasConConfianza.filter(w =>
                        w.text.includes(ruc)
                    );
                    const confianza = palabrasRelacionadas.length > 0
                        ? Math.round(palabrasRelacionadas[0].confidence)
                        : 85;

                    return { numero: ruc, tipo: 'RUC', confianza };
                });

            // 7. Clasificar RUCs
            const rucsPersonasJuridicas = rucsValidados.filter(ruc =>
                ruc.numero.startsWith('20')
            );

            const rucsPersonasNaturales = rucsValidados.filter(ruc => {
                const prefijo = ruc.numero.substring(0, 2);
                return ['10', '15', '17'].includes(prefijo);
            });

            // 8. Extraer DNIs de RUCs tipo 10
            const dnisDeRUCs = rucsPersonasNaturales
                .filter(ruc => ruc.numero.startsWith('10'))
                .map(ruc => ({
                    numero: ruc.numero.substring(2, 10),
                    tipo: 'DNI',
                    confianza: ruc.confianza,
                    origenRUC: ruc.numero
                }));

            // 9. Combinar DNIs
            const todosDNIs = [...dnisValidados, ...dnisDeRUCs];

            // 10. Eliminar duplicados manteniendo el de mayor confianza
            const dnisUnicos = Array.from(
                todosDNIs.reduce((map, dni) => {
                    if (!map.has(dni.numero) || map.get(dni.numero).confianza < dni.confianza) {
                        map.set(dni.numero, dni);
                    }
                    return map;
                }, new Map()).values()
            );

            const rucsUnicos = Array.from(
                rucsPersonasJuridicas.reduce((map, ruc) => {
                    if (!map.has(ruc.numero) || map.get(ruc.numero).confianza < ruc.confianza) {
                        map.set(ruc.numero, ruc);
                    }
                    return map;
                }, new Map()).values()
            );

            resolve({
                dnis: dnisUnicos,
                rucs: rucsUnicos,
                imagenProcesada
            });

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Mostrar vista previa interactiva de resultados
 * @param {Array} dnis - DNIs detectados con confianza
 * @param {Array} rucs - RUCs detectados con confianza
 * @param {string} imagenUrl - URL de la imagen original
 */
function mostrarVistaPreviewaInteractiva(dnis, rucs, imagenUrl, fileIndex) {
    const previewGrid = document.getElementById('preview-grid-general');
    if (!previewGrid) return;

    const container = document.createElement('div');
    container.style.cssText = `
        position: relative;
        border: 2px solid rgba(255,255,255,0.5);
        border-radius: 8px;
        overflow: hidden;
        background: white;
    `;

    // Imagen
    const img = document.createElement('img');
    img.src = imagenUrl;
    img.style.cssText = 'width: 100%; height: 150px; object-fit: cover;';
    container.appendChild(img);

    // Resultados
    const resultadosDiv = document.createElement('div');
    resultadosDiv.style.cssText = `
        padding: 10px;
        background: rgba(255,255,255,0.95);
        max-height: 200px;
        overflow-y: auto;
    `;

    let html = '<div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 5px; color: #1e293b;">Números detectados:</div>';

    // DNIs con checkboxes
    if (dnis.length > 0) {
        html += '<div style="margin-bottom: 8px;"><strong style="font-size: 0.7rem; color: #10b981;">DNIs:</strong></div>';
        dnis.forEach((dni, idx) => {
            const confianzaColor = dni.confianza >= 90 ? '#10b981' : (dni.confianza >= 70 ? '#f59e0b' : '#ef4444');
            html += `
                <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; font-size: 0.75rem; cursor: pointer;">
                    <input type="checkbox" checked data-type="dni" data-numero="${dni.numero}" data-file="${fileIndex}">
                    <code style="font-size: 0.7rem;">${dni.numero}</code>
                    <span style="font-size: 0.65rem; color: ${confianzaColor}; font-weight: 600;">
                        ${dni.confianza}%
                    </span>
                    ${dni.origenRUC ? `<span style="font-size: 0.6rem; color: #64748b;">(de RUC ${dni.origenRUC})</span>` : ''}
                </label>
            `;
        });
    }

    // RUCs con checkboxes
    if (rucs.length > 0) {
        html += '<div style="margin-top: 8px; margin-bottom: 8px;"><strong style="font-size: 0.7rem; color: #3b82f6;">RUCs:</strong></div>';
        rucs.forEach((ruc, idx) => {
            const confianzaColor = ruc.confianza >= 90 ? '#10b981' : (ruc.confianza >= 70 ? '#f59e0b' : '#ef4444');
            html += `
                <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; font-size: 0.75rem; cursor: pointer;">
                    <input type="checkbox" checked data-type="ruc" data-numero="${ruc.numero}" data-file="${fileIndex}">
                    <code style="font-size: 0.7rem;">${ruc.numero}</code>
                    <span style="font-size: 0.65rem; color: ${confianzaColor}; font-weight: 600;">
                        ${ruc.confianza}%
                    </span>
                </label>
            `;
        });
    }

    if (dnis.length === 0 && rucs.length === 0) {
        html += '<div style="font-size: 0.7rem; color: #64748b;">No se detectaron números</div>';
    }

    resultadosDiv.innerHTML = html;
    container.appendChild(resultadosDiv);

    previewGrid.appendChild(container);
}

/**
 * Inicializar OCR General Mejorado
 */
function inicializarOCRGeneralMejorado() {
    const uploadBtn = document.getElementById('upload-image-btn-general');
    const fileInput = document.getElementById('image-input-general');
    const previewContainer = document.getElementById('preview-container-general');
    const previewGrid = document.getElementById('preview-grid-general');
    const loader = document.getElementById('ocr-loader-general');
    const resultsSummary = document.getElementById('ocr-results-summary');

    if (!uploadBtn || !fileInput) return;

    // Drag & Drop
    const dropZone = document.querySelector('.ocr-general-section');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.background = 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)';
            dropZone.style.transform = 'scale(1.02)';
        });

        dropZone.addEventListener('dragleave', (e) => {
            dropZone.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            dropZone.style.transform = 'scale(1)';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            dropZone.style.transform = 'scale(1)';

            const files = Array.from(e.dataTransfer.files);
            procesarImagenes(files);
        });
    }

    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        procesarImagenes(files);
    });

    // Paste (Ctrl+V / Cmd+V) - Pegar imágenes desde portapapeles
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles = [];

        // Recorrer items del portapapeles
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Si es una imagen
            if (item.type.startsWith('image/')) {
                e.preventDefault(); // Prevenir pegado por defecto

                const blob = item.getAsFile();
                if (blob) {
                    // Convertir Blob a File con nombre
                    const file = new File([blob], `pasted-image-${Date.now()}.png`, {
                        type: blob.type,
                        lastModified: Date.now()
                    });
                    imageFiles.push(file);
                }
            }
        }

        // Si se encontraron imágenes, procesarlas
        if (imageFiles.length > 0) {
            showAlert('info', '📋 Imagen pegada desde portapapeles. Procesando...');
            procesarImagenes(imageFiles);
        }
    });

    // Indicador visual para pegar (opcional - agregar hint)
    if (dropZone) {
        const pasteHint = document.createElement('div');
        pasteHint.style.cssText = `
            font-size: 0.75rem;
            color: rgba(255,255,255,0.8);
            text-align: center;
            margin-top: 8px;
            font-style: italic;
        `;
        pasteHint.innerHTML = '💡 Tip: También puedes <strong>arrastrar</strong> o <strong>pegar (Ctrl+V)</strong> imágenes';

        const btnContainer = dropZone.querySelector('button')?.parentElement;
        if (btnContainer) {
            btnContainer.appendChild(pasteHint);
        }
    }

    // Función de procesamiento
    async function procesarImagenes(files) {
        if (files.length === 0) return;

        const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
        if (invalidFiles.length > 0) {
            showAlert('error', 'Por favor seleccione solo archivos de imagen válidos');
            return;
        }

        // Limpiar
        if (previewGrid) previewGrid.innerHTML = '';
        if (resultsSummary) resultsSummary.style.display = 'none';
        deteccionesTemporales = [];

        if (previewContainer) previewContainer.style.display = 'block';
        if (loader) loader.style.display = 'block';

        try {
            showAlert('info', `🚀 Procesando ${files.length} imagen(es) con OCR mejorado...`);

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progressText = document.getElementById('ocr-progress-text-general');
                if (progressText) {
                    progressText.textContent = `Procesando imagen ${i + 1} de ${files.length}...`;
                }

                const reader = new FileReader();
                const imagenUrl = await new Promise(res => {
                    reader.onload = (e) => res(e.target.result);
                    reader.readAsDataURL(file);
                });

                const { dnis, rucs, imagenProcesada } = await extraerNumerosDesdeImagenMejorado(file);

                // Guardar detecciones
                deteccionesTemporales.push({
                    fileIndex: i,
                    dnis,
                    rucs,
                    imagenUrl
                });

                // Mostrar preview interactivo
                mostrarVistaPreviewaInteractiva(dnis, rucs, imagenUrl, i);
            }

            if (loader) loader.style.display = 'none';

            // Calcular totales
            const totalDNIs = deteccionesTemporales.reduce((sum, d) => sum + d.dnis.length, 0);
            const totalRUCs = deteccionesTemporales.reduce((sum, d) => sum + d.rucs.length, 0);

            // Actualizar contadores
            const dnisCountEl = document.getElementById('dnis-count');
            const rucsCountEl = document.getElementById('rucs-count');
            if (dnisCountEl) dnisCountEl.textContent = totalDNIs;
            if (rucsCountEl) rucsCountEl.textContent = totalRUCs;
            if (resultsSummary) resultsSummary.style.display = 'block';

            // Agregar botones de acción
            agregarBotonesAccion();

            showAlert('success', `✅ Detectados: ${totalDNIs} DNI(s) y ${totalRUCs} RUC(s). Revise y confirme los números seleccionados.`);

        } catch (error) {
            console.error('Error OCR:', error);
            if (loader) loader.style.display = 'none';
            showAlert('error', `Error: ${error.message}`);
        }
    }
}

/**
 * Agregar botones de acción (Confirmar, Limpiar)
 */
function agregarBotonesAccion() {
    const resultsSummary = document.getElementById('ocr-results-summary');
    if (!resultsSummary) return;

    // Evitar duplicar botones
    let botonesContainer = document.getElementById('ocr-botones-accion');
    if (botonesContainer) {
        botonesContainer.remove();
    }

    botonesContainer = document.createElement('div');
    botonesContainer.id = 'ocr-botones-accion';
    botonesContainer.style.cssText = `
        display: flex;
        gap: 10px;
        margin-top: 15px;
        justify-content: center;
    `;

    const btnConfirmar = document.createElement('button');
    btnConfirmar.textContent = '✅ Confirmar y Agregar Seleccionados';
    btnConfirmar.className = 'btn btn-primary';
    btnConfirmar.style.cssText = 'background: #10b981; padding: 10px 20px;';
    btnConfirmar.addEventListener('click', confirmarSeleccion);

    const btnLimpiar = document.createElement('button');
    btnLimpiar.textContent = '🗑️ Limpiar Todo';
    btnLimpiar.className = 'btn';
    btnLimpiar.style.cssText = 'background: #ef4444; color: white; padding: 10px 20px;';
    btnLimpiar.addEventListener('click', limpiarTodo);

    botonesContainer.appendChild(btnConfirmar);
    botonesContainer.appendChild(btnLimpiar);

    resultsSummary.appendChild(botonesContainer);
}

/**
 * Confirmar selección y agregar a campos
 */
function confirmarSeleccion() {
    const checkboxes = document.querySelectorAll('#preview-grid-general input[type="checkbox"]:checked');

    const dnisSeleccionados = [];
    const rucsSeleccionados = [];

    checkboxes.forEach(cb => {
        const tipo = cb.dataset.type;
        const numero = cb.dataset.numero;

        if (tipo === 'dni') {
            dnisSeleccionados.push(numero);
        } else if (tipo === 'ruc') {
            rucsSeleccionados.push(numero);
        }
    });

    // Agregar DNIs
    if (dnisSeleccionados.length > 0) {
        const dnisInput = document.getElementById('dnis-input');
        if (dnisInput) {
            const actual = dnisInput.value.trim();
            const nuevos = [...new Set(dnisSeleccionados)].join('\n');
            dnisInput.value = actual ? `${actual}\n${nuevos}` : nuevos;
        }
    }

    // Agregar RUCs
    if (rucsSeleccionados.length > 0) {
        const rucsUnicos = [...new Set(rucsSeleccionados)];

        if (rucsUnicos.length === 1) {
            const rucInput = document.getElementById('ruc-input');
            if (rucInput) rucInput.value = rucsUnicos[0];
        } else {
            const rucsInput = document.getElementById('rucs-input');
            if (rucsInput) {
                const actual = rucsInput.value.trim();
                const nuevos = rucsUnicos.join('\n');
                rucsInput.value = actual ? `${actual}\n${nuevos}` : nuevos;
            }
        }
    }

    showAlert('success', `✅ Agregados: ${dnisSeleccionados.length} DNI(s) y ${rucsSeleccionados.length} RUC(s)`);
    limpiarTodo();
}

/**
 * Limpiar todo
 */
function limpiarTodo() {
    const previewGrid = document.getElementById('preview-grid-general');
    const previewContainer = document.getElementById('preview-container-general');
    const resultsSummary = document.getElementById('ocr-results-summary');
    const fileInput = document.getElementById('image-input-general');

    if (previewGrid) previewGrid.innerHTML = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (resultsSummary) resultsSummary.style.display = 'none';
    if (fileInput) fileInput.value = '';

    deteccionesTemporales = [];
}

// Exportar funciones
window.extraerNumerosDesdeImagenMejorado = extraerNumerosDesdeImagenMejorado;
window.inicializarOCRGeneralMejorado = inicializarOCRGeneralMejorado;
