# Valentia Epigraphica — prototipo 0.1
PWA estática en castellano, sin dependencias ni backend. Abrir `index.html` permite probar fichas y preguntas localmente. Para GPS y funcionamiento offline PWA, servir mediante HTTPS (GitHub Pages) o localhost. Para probar en ordenador: `python3 -m http.server 8000` desde esta carpeta y visitar http://localhost:8000. En iPhone/iPad: publicar en Pages, abrir Safari y Añadir a pantalla de inicio; abrir una vez con conexión y comprobar después en modo avión.

## Datos y decisiones
Ocho fichas basadas en el dosier «inscripciones imprimible» y el cuestionario «ACTIVIDAD INSCRIPCIONES»; 16 preguntas de selección múltiple. Se han corregido nomen Riccius (no praenomen) y la traducción de Avitus como cognomen. LAPIDÆ se conserva con advertencia. El contexto histórico es resumido y las hipótesis no se presentan como certezas. No es una edición epigráfica crítica.

Coordenadas y trazado extraídos de ruta-por-la-inscripciones-romanas-de-valencia.gpx, ruta de Wikiloc 36562169, dibujada manualmente. Plano esquemático (puntos de track 78–114, índices desde cero) sin cartografía base. Cuatro zonas de proximidad; los cuatro últimos puntos tienen nombre genérico y su asignación individual es provisional. No se incluyen fotografías: los documentos no contienen fotos y faltan imágenes verificadas con permiso de uso. Las distancias son en línea recta, aproximadas. GPS no obligatorio, no se conserva ni envía. El seguimiento se detiene al ocultar la página.

El progreso se guarda localmente; puntuación sobre 16 según últimas respuestas comprobadas; se permite corregir sin penalización. Reinicio con confirmación. No hay exportación de resultados ni versión valenciana aún. No hay registros de alumnos.

## Publicar
Crear repositorio independiente `ValentiaEpigraphica`, copiar los archivos a la raíz de `main`, habilitar Pages desde esa rama y la carpeta raíz. No hay compilación. Cambiar la versión de caché en `sw.js` al publicar cambios. Revisar derechos/atribución del trazado y de futuras imágenes antes de difusión pública. Comprobar ubicaciones y GPS in situ.