'use strict';
const {items}=VE_DATA;const main=document.querySelector('#main'),key='valentia-epigraphica-v1';let storageOK=true;function load(){try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{storageOK=false;return {}}}let saved=load(),answers=normalizeAnswers(saved.answers),theme=saved.theme||((matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'),started=saved.started===true||Object.keys(answers).length>0,tab=started?'route':'welcome',selected=null,position=null,watch=null,gpsMessage='Activa la ubicación para ver la distancia aproximada.';document.documentElement.dataset.theme=theme;
function normalizeAnswers(raw) {
  const valid = {};
  for (const x of items) {
    const entry = raw?.[x.id];
    if (!entry) continue;
    valid[x.id] = {};
    for (const field of ['draft', 'graded']) {
      if (Array.isArray(entry[field])) {
        valid[x.id][field] = x.questions.map((q, i) => {
          const value = entry[field][i];
          return Number.isInteger(value) && value >= 0 && value < q.options.length ? value : null;
        });
      }
    }
  }
  return valid;
}
function save(){try{localStorage.setItem(key,JSON.stringify({answers,theme,started}));storageOK=true}catch{storageOK=false}
  const status = document.querySelector('#storage-status');
  status.textContent = storageOK ? '' : 'El progreso solo se conserva mientras esta página permanezca abierta.';
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const item=id=>items.find(x=>x.id===id);const complete=x=>Array.isArray(answers[x.id]?.graded)&&x.questions.every((q,i)=>Number.isInteger(answers[x.id].graded[i]));const count=()=>items.filter(complete).length;const score=()=>items.reduce((s,x)=>s+(complete(x)?x.questions.filter((q,i)=>q.correct===answers[x.id].graded[i]).length:0),0);const zones=[1,2,3,4].map(id=>item(id));
function hav(a,b,c,d){const r=Math.PI/180,h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)))}
function proximity(x) {
  if (!position) return 'Ubicación sin señal';
  const zone = zones[x.zone - 1];
  const distance = hav(position.latitude, position.longitude, zone.lat, zone.lon);
  const accuracy = position.accuracy;
  const approx = Math.max(10, Math.round(distance / 10) * 10);
  if (accuracy > 60) return 'Señal poco precisa';
  const band = d => d < 25 ? 'En las inmediaciones' : d < 60 ? 'Muy cerca' : d <= 120 ? 'Acercándose' : 'Lejos';
  const lower = band(Math.max(0, distance - accuracy));
  const upper = band(distance + accuracy);
  const label = lower === upper ? lower : 'Proximidad incierta';
  return `≈ ${approx} m · ${label}`;
}
function gpsPanel(){return `<div class="gps-controls"><div class="row"><h3>Ubicación</h3><button id="gps" ${watch!==null?'aria-pressed="true"':''}>${watch!==null?'Desactivar GPS':'Activar GPS'}</button></div><p id="gps-status" class="muted" role="status">${esc(gpsMessage)}</p><p class="muted" style="margin:0">Solo se usa en este dispositivo; no se guarda ni se envía. No es necesario para responder.</p></div>`}
const bounds = { north: 39.4770, south: 39.4725, west: -0.3761, east: -0.3719 };
const scale = 350 / (bounds.north - bounds.south);
const mapWidth = (bounds.east - bounds.west) * Math.cos(39.47 * Math.PI / 180) * scale;
function xy(lat, lon) {
  return [(lon - bounds.west) / (bounds.east - bounds.west) * mapWidth, (bounds.north - lat) * scale];
}
const mapBase = globalThis.VE_MAP || '';
const mapCaption = mapBase ? '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · Zonas numeradas en orden.' : 'Zonas numeradas en orden, norte arriba.';
function photos(item) {
  const [detail, ...context] = item.photos || [];
  if (!detail) return '';
  const figure = photo => `<figure class="photo">
    <a href="${esc(photo.src)}" target="_blank" rel="noopener" aria-label="Ampliar fotografía: ${esc(photo.alt)}">
      <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="${photo.width}" height="${photo.height}">
    </a>
    <figcaption><a href="${esc(photo.source)}">${esc(photo.author)}</a> · <a href="${esc(photo.licenseUrl)}">${esc(photo.license)}</a> · ${esc(photo.adaptation)}</figcaption>
  </figure>`;
  return figure(detail) + (context.length
    ? `<details><summary>Ver el conjunto en la fachada</summary>${context.map(figure).join('')}</details>`
    : '');
}
function map(){const dots=zones.map(z=>{const [x,y]=xy(z.lat,z.lon);return `<g><circle class="dot" cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y+4}" text-anchor="middle">${z.zone}</text></g>`}).join('');let user='';if(position){const [x,y]=xy(position.latitude,position.longitude);if(x>=0&&x<=mapWidth&&y>=0&&y<=350)user=`<circle class="accuracy" cx="${x}" cy="${y}" r="${Math.min(200,position.accuracy/111195*scale)}"/><circle class="user" cx="${x}" cy="${y}" r="6"/>`;}return `<svg class="map" viewBox="0 0 ${mapWidth} 350" role="img" aria-label="Callejero del itinerario con cuatro zonas numeradas y el norte arriba">${mapBase}${dots}${user}<path d="M233 35 L233 16 M229 22 L233 16 L237 22" fill="none" stroke="currentColor" stroke-width="2"/><text x="233" y="12" text-anchor="middle" style="fill:currentColor">N</text></svg>`}
function progress(){return `<div class="row"><span>Inscripciones completadas</span><strong>${count()}/8</strong></div><div class="progress" role="progressbar" aria-label="Inscripciones completadas" aria-valuenow="${count()}" aria-valuemin="0" aria-valuemax="8"><span style="width:${count()/8*100}%"></span></div>`}
function renderWelcome() {
  main.innerHTML = `<section class="card welcome">
    <h2>Ocho inscripciones romanas</h2>
    <p>Recorre el centro de Valencia, lee cada inscripción en su lugar y responde dos preguntas breves.</p>
    <button class="primary wide" data-go="route">Empezar recorrido</button>
  </section>`;
}

function renderRoute() {
  const next = items.find(x => !complete(x));
  main.innerHTML = `<h2>Itinerario</h2>
    <div class="card">${progress()}
      ${next ? `<p class="next-stop"><strong>${next.roman} · ${esc(next.street)}</strong><br>${esc(next.title)}</p>
        <button class="primary wide" data-open="${next.id}">${next.id === 1 ? 'Abrir primera inscripción' : 'Abrir siguiente inscripción'}</button>`
      : '<p>Recorrido completado.</p><button class="primary wide" data-go="results">Ver resultados</button>'}
    </div>
    <div class="card">
      <h3>Mapa del recorrido</h3>
      <div id="map">${map()}</div>
      <p class="muted">${mapCaption} El punto azul indica tu posición dentro del plano.</p>
      ${gpsPanel()}
      ${zones.map(z => `<div class="zone"><button data-open="${z.id}"><strong>${z.zone}. ${esc(z.street)}</strong><br><small>${z.zone === 4 ? 'IV–VIII · 5 inscripciones' : z.roman + ' · 1 inscripción'}</small></button><small data-distance="${z.id}">${proximity(z)}</small></div>`).join('')}
      <p class="note">El GPS indica la proximidad a la plaza. En la fachada, consulta la ubicación de cada ficha.</p>
    </div>`;
}
function renderList(){main.innerHTML=`<h2>Inscripciones</h2><div class="card">${progress()}</div>${items.map(x=>`<button class="list-item" data-open="${x.id}"><span class="number">${x.roman}</span><span class="list-title"><strong>${esc(x.title)}</strong><small>${esc(x.street)} · ${esc(x.date)}</small></span><span class="${complete(x)?'done':'muted'}" aria-label="${complete(x)?'Completada':'Pendiente'}">${complete(x)?'✓':'›'}</span></button>`).join('')}`}
function formatLatinTerms(text) {
  return text.split('*').map((part, index) =>
    index % 2 ? `<i lang="la">${esc(part)}</i>` : esc(part)
  ).join('');
}

function transcription(item) {
  const fields = item.latin.split('\n\n');
  return `<div class="transcription">
    <button id="enlarge-latin" type="button" aria-pressed="false" aria-controls="latin-text">Ampliar texto latino</button>
    <div class="stone-frame stone-frame--${esc(item.frame)}">
      <div id="latin-text" class="epigraph" lang="la" tabindex="0" role="region" aria-label="Transcripción latina">
        <div class="inscription-fields">${fields.map(field => `<pre>${esc(field)}</pre>`).join('')}</div>
      </div>
    </div>
  </div>`;
}

function renderDetail(){const x=item(selected),a=answers[x.id]||{},draft=a.draft||[],graded=complete(x)&&x.questions.every((q,i)=>draft[i]===a.graded[i]);main.innerHTML=`<button class="back" data-go="list">‹ Todas las inscripciones</button><p class="muted" id="completion-status">${x.roman} · ${complete(x) ? "Actividad completada" : "Actividad pendiente"}</p><h2>${esc(x.title)}</h2><p class="muted">${esc(x.street)} · ${esc(x.date)}</p><div class="card"><div class="row"><strong data-distance="${x.id}">${proximity(x)}</strong><button id="gps">${watch!==null?'Desactivar GPS':'Activar GPS'}</button></div><p id="gps-status" class="muted" role="status">${esc(gpsMessage)}</p><p class="muted">${esc(x.locationHint)}</p><p><a href="${esc(x.streetView)}" target="_blank" rel="noopener noreferrer">Ver la fachada en Street View</a></p>${photos(x)}${transcription(x)}<details><summary>Traducción</summary><p>${esc(x.translation)}</p></details><details><summary>Contexto histórico</summary><p>${esc(x.context)}</p></details></div><form class="card" id="quiz"><h3>Actividades</h3>${x.questions.map((q,i)=>`<fieldset class="question"><legend>${i+1}. ${formatLatinTerms(q.text)}</legend>${q.options.map((o,j)=>`<label class="option"><input type="radio" name="q${i}" value="${j}" ${draft[i]===j?'checked':''}><span>${esc(o)}</span></label>`).join('')}<p class="feedback" hidden></p></fieldset>`).join('')}<button class="primary wide" id="check" type="submit" ${x.questions.every((q,i)=>Number.isInteger(draft[i]))?'':'disabled'}>Comprobar respuestas</button><p class="done quiz-result" role="status"></p></form><div class="actions">${x.id>1?`<button data-open="${x.id-1}">‹ Anterior</button>`:''}${x.id<8?`<button class="next-inscription" data-open="${x.id+1}">Siguiente inscripción · ${item(x.id+1).roman}</button>`:`<button data-go="results">Ver resultados ›</button>`}</div>`;const form = document.querySelector('#quiz');
  const feedback = [...form.querySelectorAll('.feedback')];
  const result = form.querySelector('.quiz-result');
  const check = form.querySelector('#check');
  const nextButton = main.querySelector('.next-inscription');

  function showFeedback(gradedAnswers) {
    for (const [i, message] of feedback.entries()) {
      const question = x.questions[i];
      const correct = gradedAnswers?.[i] === question.correct;
      message.hidden = !gradedAnswers;
      message.className = 'feedback ' + (correct ? 'correct' : 'incorrect');
      message.innerHTML = gradedAnswers
        ? (correct ? 'Correcto. ' : 'Respuesta incorrecta. ') + formatLatinTerms(question.explanation)
        : '';
    }
    result.textContent = gradedAnswers
      ? x.questions.filter((q, i) => q.correct === gradedAnswers[i]).length + '/2 respuestas correctas'
      : '';
    nextButton?.classList.toggle('primary', Boolean(gradedAnswers));
  }

  showFeedback(graded ? draft : null);
  form.addEventListener('change', event => {
    const i = Number(event.target.name.slice(1));
    const current = answers[x.id] ||= { draft: [] };
    current.draft ||= [];
    current.draft[i] = Number(event.target.value);
    save();
    showFeedback(null);
    check.disabled = !x.questions.every((q, j) => Number.isInteger(current.draft[j]));
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const current = answers[x.id];
    if (!current || !x.questions.every((q, i) => Number.isInteger(current.draft[i]))) return;
    current.graded = current.draft.slice();
    save();
    document.querySelector('#completion-status').textContent = x.roman + ' · Actividad completada';
    showFeedback(current.graded);
  });

  const enlarge = document.querySelector('#enlarge-latin');
  const latin = document.querySelector('#latin-text');
  enlarge.addEventListener('click', () => {
    const enlarged = latin.classList.toggle('enlarged');
    enlarge.setAttribute('aria-pressed', String(enlarged));
    enlarge.textContent = enlarged ? 'Reducir texto latino' : 'Ampliar texto latino';
  });
}
function renderResults(){main.innerHTML=`<h2>Resultados</h2><div class="card">${progress()}<p class="muted">Puntuación (últimas respuestas comprobadas)</p><div class="score">${score()}/16</div><p>${count()===8?'Recorrido completado.':'Puedes continuar en cualquier momento.'}</p></div><div class="card">${items.map(x=>`<div class="zone"><button data-open="${x.id}">${x.roman}. ${esc(x.title)}</button><strong>${complete(x)?x.questions.filter((q,i)=>q.correct===answers[x.id].graded[i]).length+'/2':'—'}</strong></div>`).join('')}</div><div class="card"><h3>Reiniciar la actividad</h3><p class="muted">Borra las respuestas de este dispositivo para repetir la actividad.</p><button class="wide" id="reset">Reiniciar actividad</button></div>`}
function render(){document.querySelector("nav").hidden=tab==="welcome";document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===(tab==='detail'?'list':tab)?'page':'false'));({welcome:renderWelcome,route:renderRoute,list:renderList,detail:renderDetail,results:renderResults}[tab])();if(!storageOK)document.querySelector('#storage-status').textContent='No se pudo acceder al progreso guardado en este dispositivo.'}
function go(t,id){if(tab==='welcome'&&t!=='welcome'){started=true;save()}if(t==='results'&&watch!==null)stopGPS();tab=t;selected=id||null;render();scrollTo(0,0);main.focus({preventScroll:true})}
function refreshGPS(){const s=document.querySelector('#gps-status');if(s)s.textContent=gpsMessage;document.querySelectorAll('[data-distance]').forEach(e=>e.textContent=proximity(item(Number(e.dataset.distance))));const m=document.querySelector('#map');if(m)m.innerHTML=map();const b=document.querySelector('#gps');if(b){b.textContent=watch===null?'Activar GPS':'Desactivar GPS';b.setAttribute('aria-pressed',String(watch!==null))}}
function stopGPS(){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;position=null;gpsMessage='Ubicación desactivada. Puedes seguir con las actividades.';refreshGPS()}
function startGPS(){if(watch!==null){stopGPS();return}if(!navigator.geolocation||!isSecureContext){gpsMessage='Ubicación no disponible. Abre la web mediante HTTPS o localhost.';refreshGPS();return}gpsMessage='Buscando tu ubicación…';watch=navigator.geolocation.watchPosition(p=>{position=p.coords;gpsMessage=`Precisión estimada: ±${Math.round(position.accuracy)} m.${position.accuracy>35?' Señal poco precisa; usa las referencias de la calle.':''}`;refreshGPS()},e=>{position=null;gpsMessage=e.code===1?'Permiso denegado. Puedes continuar sin GPS.':'No se ha obtenido ubicación fiable. Puedes continuar sin GPS.';if(e.code===1&&watch!==null){navigator.geolocation.clearWatch(watch);watch=null}refreshGPS()},{enableHighAccuracy:false,maximumAge:5000,timeout:15000});refreshGPS()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tab)go(b.dataset.tab);else if(b.dataset.go)go(b.dataset.go);else if(b.dataset.open)go('detail',Number(b.dataset.open));else if(b.id==='gps')startGPS();else if(b.id==='reset'&&confirm('¿Borrar todas las respuestas de esta actividad?')){answers={};started=false;save();stopGPS();go('welcome')}else if(b.id==='theme'){theme=({light:'dark',dark:'oled',oled:'light'})[theme]||'light';document.documentElement.dataset.theme=theme;save()}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&watch!==null)stopGPS()});render();

const offlineStatus = document.querySelector('#offline-status');
if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('./sw.js').then(async () => {
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    }
    offlineStatus.textContent = 'Disponible sin conexión';
  }).catch(() => {
    offlineStatus.textContent = 'Descarga sin conexión no disponible';
  });
}

const installPanel = document.querySelector('#install-panel');
const installButton = document.querySelector('#install-app');
const installHelp = document.querySelector('#install-help');
const standalone = matchMedia('(display-mode: standalone)');
let installPrompt;

installPanel.hidden = standalone.matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  installPanel.hidden = true;
});

installButton.addEventListener('click', async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = undefined;
    try {
      const choice = await prompt.prompt();
      if (choice?.outcome === 'accepted') installPanel.hidden = true;
      return;
    } catch {
      // Offer the browser menu when the native prompt is unavailable.
    }
  }

  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safariDesktop = !appleMobile && /Version\/.*Safari\//.test(navigator.userAgent);
  installHelp.textContent = appleMobile
    ? 'En Safari, toca Compartir y «Añadir a pantalla de inicio». Si aparece «Abrir como app web», actívalo.'
    : safariDesktop
      ? 'En Safari, abre Archivo y elige «Añadir al Dock».'
      : 'Abre el menú del navegador y busca «Instalar aplicación» o «Añadir a pantalla de inicio».';
  installHelp.hidden = !installHelp.hidden;
  installButton.setAttribute('aria-expanded', String(!installHelp.hidden));
});
