import logging
import httpx
import asyncio
import json
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
from playwright.async_api import async_playwright, Page, Browser

# Configurar logger
logger = logging.getLogger(__name__)

# Excepciones personalizadas
class SEACEException(Exception):
    """Excepción base para errores de SEACE"""
    pass

class ValidationException(SEACEException):
    """Error de validación de datos"""
    pass

class ExtractionException(SEACEException):
    """Error durante la extracción de datos"""
    pass

class SEACEService:
    """Servicio para extraer datos de contratación de SEACE"""

    BASE_URL = "https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml"

    def __init__(self):
        self.browser = None
        self.playwright = None

    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    def validar_cui(self, cui: str) -> bool:
        """Valida el formato del CUI (7 dígitos)"""
        return bool(cui and cui.isdigit() and len(cui) == 7)

    def validar_anio(self, anio: int) -> bool:
        """Valida que el año esté en un rango razonable"""
        current_year = datetime.now().year
        return 2019 <= anio <= current_year

    async def consultar_procedimientos(self, cui: str, anio: int) -> Dict[str, Any]:
        """Consulta información de procedimientos de contratación en SEACE"""
        logger.info(f"=== INICIANDO CONSULTA SEACE PARA CUI: {cui}, AÑO: {anio} ===")

        try:
            # Validar datos de entrada
            if not self.validar_cui(cui):
                raise ValidationException(f"CUI inválido: {cui}. Debe ser un número de 7 dígitos")
            if not self.validar_anio(anio):
                raise ValidationException(f"Año inválido: {anio}. Debe estar entre 2019 y el año actual")

            logger.info(f"CUI {cui} y año {anio} validados correctamente")

            # Crear nueva página
            page = await self.browser.new_page()
            await page.set_viewport_size({"width": 1920, "height": 1080})

            try:
                # Navegar a SEACE con múltiples reintentos
                await self._navegar_a_seace(page)

                # Ejecutar búsqueda con los parámetros
                await self._ejecutar_busqueda(page, cui, anio)

                # Navegar al historial de contratación
                await self._navegar_a_historial(page)

                # Navegar a la ficha de selección
                await self._navegar_a_ficha_seleccion(page)

                # Extraer información del cronograma
                cronograma = await self._extraer_cronograma(page)

                # Navegar a "Ver integrantes y encargado" para extraer más información
                await self._navegar_a_integrantes(page)

                # Extraer información adicional
                info_adicional = await self._extraer_informacion_adicional(page)

                # Combinar toda la información
                resultado = {
                    "cui": cui,
                    "anio": anio,
                    "cronograma": cronograma,
                    "numero_contrato": info_adicional.get("numero_contrato"),
                    "informacion_adicional": info_adicional
                }

                logger.info(f"Extracción completada exitosamente para CUI {cui}")
                return resultado

            finally:
                await page.close()

        except Exception as e:
            logger.error(f"Error en consulta SEACE para CUI {cui}: {str(e)}")
            raise SEACEException(f"Error al consultar SEACE: {str(e)}")

    async def _navegar_a_seace(self, page: Page):
        """Navega a la página de SEACE con reintentos"""
        max_intentos = 3
        for intento in range(max_intentos):
            try:
                logger.info(f"Navegando a página principal de SEACE (intento {intento + 1})")
                await page.goto(self.BASE_URL, wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(3000)  # Esperar carga completa

                logger.info("Página SEACE cargada")

                # Hacer clic en la pestaña de búsqueda de procedimientos
                logger.info("Haciendo clic en pestaña de búsqueda de procedimientos")
                await page.click('text="Búsqueda de Procedimientos"')
                logger.info("Pestaña clickeada")

                # Esperar a que el formulario esté disponible
                logger.info("Esperando formulario de búsqueda")
                await page.wait_for_selector('#tbBuscador\\:idFormBuscarProceso\\:CUI', timeout=30000, state='visible')
                logger.info("Formulario disponible")
                return  # Éxito

            except Exception as e:
                logger.warning(f"Error en intento {intento + 1}: {str(e)}")
                if intento == max_intentos - 1:
                    raise ExtractionException(f"No se pudo cargar SEACE después de {max_intentos} intentos")
                await page.wait_for_timeout(5000)  # Esperar antes de reintentar

    async def _ejecutar_busqueda(self, page: Page, cui: str, anio: int):
        """Ejecuta la búsqueda inicial en SEACE"""
        logger.info(f"Ejecutando búsqueda para CUI: {cui}, Año: {anio}")

        try:
            # 1. LLENAR EL CAMPO CUI
            cui_input = await page.query_selector('#tbBuscador\\:idFormBuscarProceso\\:CUI')
            await cui_input.fill(cui)
            logger.info(f"CUI {cui} ingresado")

            # Verificar que el CUI se llenó correctamente
            cui_value = await page.evaluate('''
                document.querySelector('#tbBuscador\\\\:idFormBuscarProceso\\\\:CUI').value
            ''')
            logger.info(f"Verificación CUI en formulario: {cui_value}")

            # 2. SELECCIONAR EL AÑO
            year_dropdown_id = 'tbBuscador:idFormBuscarProceso:anioConvocatoria'
            year_dropdown_id_escaped = year_dropdown_id.replace(":", "\\\\:")

            # Abrir el dropdown de año haciendo clic en el label
            await page.evaluate(f'''
                (() => {{
                    const label = document.querySelector('#{year_dropdown_id_escaped}_label');
                    if (label) {{
                        label.click();
                        return true;
                    }}
                    return false;
                }})()
            ''')
            await page.wait_for_timeout(1500)
            logger.info("Dropdown de año abierto")

            # Seleccionar el año específico
            year_selected = await page.evaluate(f'''
                (() => {{
                    const panel = document.querySelector('#{year_dropdown_id_escaped}_panel');
                    if (panel) {{
                        const options = panel.querySelectorAll('li');
                        for (let option of options) {{
                            if (option.getAttribute('data-label') === '{anio}' ||
                                option.textContent.trim() === '{anio}') {{
                                option.click();
                                return true;
                            }}
                        }}
                    }}
                    return false;
                }})()
            ''')

            if year_selected:
                logger.info(f"Año {anio} seleccionado correctamente")
            else:
                logger.warning(f"No se pudo seleccionar el año {anio}")

            await page.wait_for_timeout(1000)

            # Verificar que el año se seleccionó correctamente
            year_value = await page.evaluate(f'''
                document.querySelector('#{year_dropdown_id_escaped}_label')?.textContent || "NO ENCONTRADO"
            ''')
            logger.info(f"Verificación año en formulario: {year_value}")

            # 3. VERIFICAR Y SELECCIONAR VERSION SEACE 3
            try:
                # Intentar encontrar y verificar el dropdown de versión con Playwright
                version_label_selector = '#tbBuscador\\:idFormBuscarProceso\\:ddlVersionSeace_label'
                version_dropdown_selector = '#tbBuscador\\:idFormBuscarProceso\\:ddlVersionSeace'

                # Verificar versión actual
                try:
                    version_label = await page.query_selector(version_label_selector)
                    if version_label:
                        current_version = await version_label.inner_text()
                    else:
                        current_version = "NO ENCONTRADO"
                    logger.info(f"Versión SEACE actual: {current_version}")
                except Exception as e:
                    logger.warning(f"Error obteniendo versión actual: {str(e)}")
                    current_version = "NO ENCONTRADO"

                # Si no es SEACE 3, cambiarla
                if "Seace 3" not in current_version and "SEACE 3" not in current_version:
                    logger.info("Intentando cambiar a SEACE 3...")

                    # Intentar hacer clic en el label del dropdown
                    try:
                        version_label = await page.query_selector(version_label_selector)
                        if version_label:
                            await version_label.click()
                            logger.info("Clic en label de versión")
                            await page.wait_for_timeout(1500)

                            # Buscar y hacer clic en SEACE 3 en el panel
                            panel_selector = '#tbBuscador\\:idFormBuscarProceso\\:ddlVersionSeace_panel'
                            panel = await page.query_selector(panel_selector)
                            if panel:
                                # Buscar la opción SEACE 3
                                options = await panel.query_selector_all('li')
                                for option in options:
                                    text = await option.inner_text()
                                    if 'Seace 3' in text or 'SEACE 3' in text:
                                        await option.click()
                                        logger.info("SEACE 3 seleccionado")
                                        await page.wait_for_timeout(1000)

                                        # Verificar selección
                                        version_label = await page.query_selector(version_label_selector)
                                        if version_label:
                                            new_version = await version_label.inner_text()
                                            logger.info(f"Nueva versión SEACE: {new_version}")
                                        break
                            else:
                                logger.warning("No se encontró el panel de opciones de versión")
                        else:
                            # Si no funciona el label, intentar con el dropdown directamente
                            dropdown = await page.query_selector(version_dropdown_selector)
                            if dropdown:
                                await dropdown.click()
                                logger.info("Clic en dropdown de versión")
                                await page.wait_for_timeout(1500)
                    except Exception as e:
                        logger.warning(f"Error al cambiar versión SEACE: {str(e)}")
                        # Continuar sin cambiar la versión
                else:
                    logger.info("Ya está seleccionado SEACE 3")

            except Exception as e:
                logger.warning(f"Error en selección de versión SEACE: {str(e)}")
                # Continuar sin verificar/cambiar la versión

            # 4. VERIFICACIÓN FINAL ANTES DE BUSCAR
            logger.info("=== VERIFICACIÓN FINAL DE CAMPOS ===")

            # Verificar CUI
            cui_input = await page.query_selector('#tbBuscador\\:idFormBuscarProceso\\:CUI')
            final_cui = await cui_input.get_attribute('value') if cui_input else "NO"
            logger.info(f"CUI final: {final_cui}")

            # Verificar año
            year_label = await page.query_selector('#tbBuscador\\:idFormBuscarProceso\\:anioConvocatoria_label')
            final_year = await year_label.inner_text() if year_label else "NO"
            logger.info(f"Año final: {final_year}")

            # Verificar versión
            version_label = await page.query_selector('#tbBuscador\\:idFormBuscarProceso\\:ddlVersionSeace_label')
            final_version = await version_label.inner_text() if version_label else "NO"
            logger.info(f"Versión final: {final_version}")

            # Esperar un poco más para asegurar que todo esté listo
            await page.wait_for_timeout(2000)

            # Hacer clic en el botón Buscar
            buscar_button = await page.query_selector('#tbBuscador\\:idFormBuscarProceso\\:btnBuscarSelToken')
            await buscar_button.click()
            logger.info("Botón Buscar clickeado")

            # Esperar a que termine la actividad de red después del clic
            logger.info("Esperando que termine la actividad de red")
            try:
                await page.wait_for_load_state('networkidle', timeout=45000)
                logger.info("Actividad de red completada")
            except Exception as e:
                logger.warning(f"Timeout esperando networkidle: {str(e)}, continuando...")

            # Esperar a que aparezcan los resultados - esperar por texto "Mostrando de"
            logger.info("Esperando que aparezcan los resultados de búsqueda")
            await page.wait_for_selector('text=Mostrando de', timeout=45000, state='visible')
            logger.info("Tabla de resultados encontrada")

            # Confirmar que la columna "Acciones" está visible
            await page.wait_for_selector('span.ui-outputlabel:text-is("Acciones")', timeout=10000, state='visible')
            logger.info("Resultados de búsqueda cargados completamente")

        except Exception as e:
            logger.error(f"Error ejecutando búsqueda: {str(e)}")
            raise ExtractionException(f"Error ejecutando búsqueda: {str(e)}")

    async def _navegar_a_historial(self, page: Page):
        """Navega al historial de contratación (primer ícono en Acciones)"""
        logger.info("Navegando a historial de contratación")

        try:
            # Buscar la tabla de resultados
            tabla_resultados = await page.wait_for_selector(
                '#tbBuscador\\:idFormBuscarProceso\\:pnlGrdResultadosProcesos table tbody tr:last-child',
                timeout=30000,
                state='visible'
            )

            # Buscar el primer ícono (historial) en la columna de Acciones
            historial_icon = await tabla_resultados.query_selector('td:last-child a.ui-commandlink:first-child')

            if not historial_icon:
                raise ExtractionException("No se encontró el ícono de historial")

            await historial_icon.click()
            logger.info("Clic en ícono de historial")

            # Esperar a que cargue el historial - buscar por texto "Visualizar historial"
            await page.wait_for_selector('text=Visualizar historial de contratación', timeout=30000, state='visible')
            logger.info("Historial cargado")

        except Exception as e:
            logger.error(f"Error navegando a historial: {str(e)}")
            raise ExtractionException(f"Error navegando a historial: {str(e)}")

    async def _navegar_a_ficha_seleccion(self, page: Page):
        """Navega a la ficha de selección (segundo ícono en la tabla de historial)"""
        logger.info("Navegando a ficha de selección")

        try:
            # Buscar todas las tablas y encontrar la que tiene la columna "Acciones"
            # En la página de historial, buscar el segundo ícono (ficha) en la primera fila
            ficha_icon = await page.wait_for_selector(
                'table tbody tr:first-child td:last-child a.ui-commandlink:nth-child(2)',
                timeout=30000,
                state='visible'
            )
            await ficha_icon.click()
            logger.info("Clic en ícono de ficha")

            # Esperar a que cargue la ficha - buscar el tab "Ficha de Seleccion"
            await page.wait_for_selector('text=Ficha de Seleccion', timeout=30000, state='visible')
            logger.info("Ficha cargada")

        except Exception as e:
            logger.error(f"Error navegando a ficha: {str(e)}")
            raise ExtractionException(f"Error navegando a ficha: {str(e)}")

    async def _navegar_a_integrantes(self, page: Page):
        """Navega a 'Ver integrantes y encargado' para extraer el número de contrato"""
        logger.info("Navegando a 'Ver integrantes y encargado'")

        try:
            # Buscar y hacer clic en el enlace
            integrantes_link = await page.wait_for_selector(
                'a:has-text("Ver integrantes y encargado")',
                timeout=30000,
                state='visible'
            )
            await integrantes_link.click()
            logger.info("Clic en enlace de integrantes")

            # Esperar a que cargue el modal o nueva sección
            await page.wait_for_timeout(2000)  # Dar tiempo para que cargue
            logger.info("Sección de integrantes cargada")

        except Exception as e:
            logger.error(f"Error navegando a integrantes: {str(e)}")
            # No lanzar excepción porque esto es información adicional
            logger.warning("No se pudo acceder a integrantes y encargado")

    async def _extraer_cronograma(self, page: Page) -> List[Dict[str, Any]]:
        """Extrae información del cronograma de la ficha de selección"""
        logger.info("Extrayendo información del cronograma")
        cronograma = []

        try:
            # Buscar la tabla del cronograma
            tabla = await page.wait_for_selector(
                'table.ui-datatable-tablewrapper tbody',
                timeout=30000,
                state='visible'
            )

            # Extraer filas del cronograma
            filas = await tabla.query_selector_all('tr')

            for fila in filas:
                columnas = await fila.query_selector_all('td')
                if len(columnas) >= 3:
                    etapa_elem = await columnas[0].query_selector('span.ui-cell-editor-output')
                    fecha_inicio_elem = await columnas[1].query_selector('span.ui-cell-editor-output')
                    fecha_fin_elem = await columnas[2].query_selector('span.ui-cell-editor-output')

                    if etapa_elem and fecha_inicio_elem and fecha_fin_elem:
                        etapa = await etapa_elem.inner_text()
                        fecha_inicio = await fecha_inicio_elem.inner_text()
                        fecha_fin = await fecha_fin_elem.inner_text()

                        cronograma.append({
                            "etapa": etapa.strip(),
                            "fecha_inicio": fecha_inicio.strip(),
                            "fecha_fin": fecha_fin.strip()
                        })

            logger.info(f"Se extrajeron {len(cronograma)} etapas del cronograma")

        except Exception as e:
            logger.error(f"Error extrayendo cronograma: {str(e)}")
            # No lanzar excepción, retornar lista vacía

        return cronograma

    async def _extraer_informacion_adicional(self, page: Page) -> Dict[str, Any]:
        """Extrae información adicional como número de contrato"""
        logger.info("Extrayendo información adicional")
        info = {}

        try:
            # Buscar número de contrato en diferentes lugares posibles
            # Intentar encontrar en el contenido actual de la página
            contenido = await page.content()

            # Buscar patrones de número de contrato
            import re
            contrato_pattern = r'(?:Contrato|CONTRATO)\s*[Nn][°oº]?\s*([\w\-\/]+)'
            match = re.search(contrato_pattern, contenido)

            if match:
                info["numero_contrato"] = match.group(1).strip()
                logger.info(f"Número de contrato encontrado: {info['numero_contrato']}")
            else:
                # Intentar buscar en elementos específicos
                try:
                    # Buscar en spans o divs que puedan contener el número
                    elementos = await page.query_selector_all('span, div')
                    for elem in elementos[:50]:  # Limitar búsqueda
                        texto = await elem.inner_text()
                        if 'contrato' in texto.lower():
                            # Extraer posible número después de la palabra contrato
                            partes = texto.split()
                            for i, parte in enumerate(partes):
                                if 'contrato' in parte.lower() and i < len(partes) - 1:
                                    posible_numero = partes[i+1].strip(':°Nº')
                                    if posible_numero:
                                        info["numero_contrato"] = posible_numero
                                        logger.info(f"Número de contrato encontrado: {posible_numero}")
                                        break
                            if "numero_contrato" in info:
                                break
                except Exception as e:
                    logger.warning(f"Error buscando número de contrato en elementos: {str(e)}")

            # Extraer otra información relevante si está disponible
            # Por ejemplo: monto, plazo, etc.

        except Exception as e:
            logger.error(f"Error extrayendo información adicional: {str(e)}")

        return info

# Función helper para usar el servicio
async def consultar_seace(cui: str, anio: int) -> Dict[str, Any]:
    """Función conveniente para consultar SEACE"""
    async with SEACEService() as service:
        return await service.consultar_procedimientos(cui, anio)
