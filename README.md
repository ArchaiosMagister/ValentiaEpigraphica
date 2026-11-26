# Valentia Epigraphica

PWA estática en castellano para visitar ocho inscripciones romanas de Valencia. Las cuatro zonas se muestran en un callejero local. El número de zona marca el orden de la visita. Dentro de la plaza, las fichas IV–VIII comparten una referencia geográfica orientativa.

La web guarda en el navegador las respuestas elegidas, las últimas respuestas comprobadas y el tema. La ubicación se activa voluntariamente, se usa en memoria y el seguimiento termina al ocultar la página o acceder a Resultados. La puntuación se basa en las últimas respuestas comprobadas.

## Pruebas y GitHub Pages

Desde la carpeta que contiene el repositorio, ejecuta `python3 -m http.server 8765 --bind 127.0.0.1` y abre `http://localhost:8765/ValentiaEpigraphica/`. La prueba usa Node y Playwright disponible en el entorno de desarrollo. Ejecuta `node tests/browser.cjs`. Las variables opcionales `VE_URL`, `PLAYWRIGHT_MODULE` y `BROWSER_EXECUTABLE` permiten configurar el servidor, el módulo y el navegador.

La raíz del repositorio contiene todos los recursos necesarios para Pages. Una vez autorizada la publicación, usa la carpeta raíz de la rama aprobada como origen. La aplicación utiliza URLs relativas y funciona bajo el prefijo del proyecto. Sube todos los recursos de cada versión juntos, añade cada archivo nuevo a `sw.js` e incrementa su versión de caché. Cerrar todas las pestañas y ventanas de la aplicación permite activar un worker actualizado que esté en espera. La clave de progreso se conserva entre versiones.

La prueba automatizada ejecutada en Brave incluye la recarga con la red deshabilitada, con comprobación de mapa, fotografía y puntuación, además de las ocho fichas, las 16 preguntas, navegación, reinicio y temas. El GPS y los tamaños de pantalla son simulaciones. Quedan pendientes la instalación desde el menú del navegador, la comprobación en iPhone, Android e iPad físicos, la comprobación de la URL definitiva en GitHub Pages.

## Edición y procedencia

La transcripción didáctica usa mayúsculas y V epigráfica, Æ para AE según el criterio tipográfico de la ficha, paréntesis para desarrollos, corchetes para restituciones y dobles corchetes para borrados. El signo (?) indica lectura dudosa. Los repertorios conservan el aparato crítico completo.

| Ficha | Cotejo y decisiones |
| --- | --- |
| I | Corell, n.º 30 y CIL II²/14, 65. Se sigue ATIMETVS en Corell. La descripción de Commons ofrece ATIMETIUS. Riccius y Riccia son el gentilicio. El origen servil es una hipótesis onomástica. |
| II | Corell, n.º 33 y CIL II²/14, 29. Eufemo recibe el homenaje y Eutiques lo dedica. Su cognomen griego no establece por sí solo un estatuto jurídico. |
| III | Corell, n.º 50 y CIL II²/14, 46. Corell registra el deterioro histórico, una limpieza posterior y edades divergentes. El ejercicio pregunta qué número expresa la lectura preferida, XXXXVI. |
| IV | Corell, n.º 2 y CIL II²/14, 2. Se conserva la distribución en seis líneas. El dativo DEO explicita la condición del destinatario. |
| V | Corell, n.º 34 y CIL II²/14, 76. Los dos textos permiten identificar esposo e hija. La filiación solo transmite el praenomen Quinto. Avitus se conserva como cognomen. |
| VI | Corell, n.º 27, Hispania Epigraphica y CIL II²/14, 43 editan LEPIDÆ frente a LAPIDÆ del dosier. La condición de liberto está explícita. |
| VII | Corell y el estudio de Alföldy discrepan en la restitución de líneas martilladas. Se sigue la disposición transmitida por Corell para la ficha. La fecha 238 se retira del relato, pues el monumento no permite fechar una revocación. |
| VIII | Corell y Pereira, CIL II 3738. Se adopta la disposición de Corell, F(elici), y el consulado IIII, con nota sobre la variante III. Corell vincula los ablativos iniciales a inlustri. Pereira y Corell discrepan sobre el posible borrado del nombre. |

- [Josep Corell, Inscripcions romanes del País Valencià V, Universitat de València](https://roderic.uv.es/bitstream/handle/10550/84089/9788411180238.pdf?sequence=1)
- [Gerardo Pereira Menaut, Inscripciones romanas de Valentia](https://mupreva.org/web_mupreva_dedalo/publicaciones/95/fr)
- [Hispania Epigraphica Online, Antonia Lépida y Aquilino](https://hepol.uah.es/pub/list.php?page=479)
- [Estudio de Géza Alföldy sobre inscripciones tarraconenses](https://recercat.cat/bitstream/id/144128/GezaAlfoldy-EstudiosTarraconenses.pdf)

## Cartografía y fotografías

- El callejero contiene vías de un extracto API de OpenStreetMap para el rectángulo `-0.3761,39.4725,-0.3719,39.4770`. El archivo `map.js` contiene las geometrías proyectadas de dicho extracto bajo ODbL. Las cuatro referencias de proximidad corresponden a las posiciones de cámara de las panorámicas aportadas por el docente. Son puntos de aproximación a las fachadas. [OpenStreetMap y ODbL](https://www.openstreetmap.org/copyright)
- La ruta de Elia.S.D. sirvió para identificar lugares. El GPX bruto y la licencia de redistribución del trazado heredado siguen pendientes de comprobación. El callejero usa las zonas numeradas para mostrar la secuencia. [Wikiloc](https://es.wikiloc.com/rutas-a-pie/ruta-por-la-inscripciones-romanas-de-valencia-36562169)
- Ficha I, fotografía de Joanbanjo, CC BY-SA 3.0, reducida a 1400 píxeles y recomprimida. [Ficha de Commons](https://commons.wikimedia.org/wiki/File:Inscripció_romana_al_carrer_de_Vidal_de_València.JPG)
- Para incorporar fotografías propias a II–VIII, guarda los archivos en `photos/` y añade sus datos a la lista `photos` de cada ficha en `data.js`, siguiendo el ejemplo de I. El formato admite varias imágenes por ficha, incluida una vista contextual. El toque abre la imagen local a tamaño completo. Incluye las imágenes en la lista del service worker para su uso sin conexión.

### Cotejo remoto de las ubicaciones

| Zona | Referencia |
| --- | --- |
| I | [Panorámica de la esquina en calle Vidal](https://maps.app.goo.gl/mZMrWqVapPmpvKMf8). La etiqueta de Oxfam corresponde a un comercio cercano. La referencia didáctica es la fachada de Vidal en la esquina del edificio de Banca March. Corell sitúa la pieza en esta calle. |
| II | [Panorámica de Trinquete de los Caballeros](https://maps.app.goo.gl/MBCYQ3S4md1jqhLQ9). Corell sitúa el pedestal en la fachada del número 1. |
| III | [Panorámica de Barchilla](https://maps.app.goo.gl/RP1HGwqWSwQJXjio6). Corell sitúa la pieza en el muro del Palacio Arzobispal, a unos dos metros del suelo. |
| IV–VIII | [Panorámica de la fachada de la Basílica](https://maps.app.goo.gl/G4nmFzRCp6Y8oDdEA). Pereira Menaut sitúa también en el muro occidental de la Basílica el pedestal de Probo, ficha VIII. |

La [panorámica del pavimento](https://maps.app.goo.gl/rDugBBjJE9LA7HLS9) apunta hacia la lápida conmemorativa de la fundación de Valentia, una pieza distinta de Probo. Se conserva como referencia documental. [Guía turística institucional de València](https://multimedia.comunitatvalenciana.com/971D84CDBDC64EEEBB47EB975D684C0F/doc/5D4F9004F45D45ED9DB6BBDE86DD330E/guia_completa_valencia_castellano.pdf)

Los enlaces externos son opcionales y no reciben la posición medida por la aplicación. El callejero y las indicaciones textuales siguen disponibles sin conexión.
