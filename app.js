'use strict';
const { items, recap } = VE_DATA;
const activities = [...items, recap];
const main = document.querySelector('#main');
const key = 'valentia-epigraphica-v1';
const competition = VE_COMP;
const themes = ['light', 'dark', 'oled'];
const defaultTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
let storageOK = true;

function normalizeAnswers(raw) {
  const valid = {};
  for (const x of activities) {
    const entry = raw?.[x.id];
    if (!entry || typeof entry !== 'object') continue;
    const record = {};
    // A text snapshot prevents an old index from silently selecting a
    // different option if the question bank is reordered or edited.
    const snapshot = Array.isArray(entry.questions) ? entry.questions : null;
    for (const field of ['draft', 'graded', 'first']) {
      if (!Array.isArray(entry[field])) continue;
      record[field] = x.questions.map((q, i) => {
        // The original Asclepius question (IV.1) was replaced. Legacy
        // index-only progress must not grade the new question with its old answer.
        if (!snapshot && x.id === 4 && i === 0) return null;
        const oldIndex = snapshot ? snapshot.findIndex(old => old?.text === q.text) : i;
        if (oldIndex < 0) return null;
        const value = entry[field][oldIndex];
        if (!Number.isInteger(value) || value < 0) return null;
        if (!snapshot) return value < q.options.length ? value : null;
        const oldOptions = snapshot[oldIndex]?.options;
        if (!Array.isArray(oldOptions) || typeof oldOptions[value] !== 'string') return null;
        const matches = q.options.map((option, j) => option === oldOptions[value] ? j : -1).filter(j => j >= 0);
        return matches.length === 1 ? matches[0] : null;
      });
    }
    if (!record.draft && !record.graded) continue;
    // A submitted first attempt remains the authoritative response after upgrade.
    if (record.first?.every(Number.isInteger)) {
      record.graded=record.first.slice();record.draft=record.first.slice();
    } else if (record.graded?.every(Number.isInteger)) {
      record.first=record.graded.slice();record.draft=record.graded.slice();
    }
    record.questions = x.questions.map(q => ({ text: q.text, options: q.options.slice() }));
    valid[x.id] = record;
  }
  return valid;
}

function normalizedState(raw) {
  raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const answers = normalizeAnswers(raw.answers);
  return {
    answers,
    group: competition.group(raw.group),
    theme: themes.includes(raw.theme) ? raw.theme : defaultTheme,
    started: raw.started === true || Object.keys(answers).length > 0,
    generation: typeof raw.generation === 'string' ? raw.generation : 'legacy',
  };
}

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    return normalizedState(raw);
  } catch {
    storageOK = false;
    return null;
  }
}

let state = readState() || normalizedState({});
let { answers, theme, started } = state;
let consulting=false;
let tab = state.group && started ? 'route' : 'welcome';
let selected = null, position = null, watch = null, gpsGeneration = 0;
let gpsMessage = 'Activa la ubicación para ver la distancia aproximada.';
let syncDetail = null, pendingWrites = 0, writeQueue = Promise.resolve();
let memoryOnly = !storageOK;

function updateTheme() {
  document.documentElement.dataset.theme = theme;
  const button = document.querySelector('#theme');
  const name = { light: 'claro', dark: 'oscuro', oled: 'OLED' }[theme];
  button.setAttribute('aria-label', 'Cambiar tema (actual: ' + name + ')');
  button.title = 'Tema ' + name;
}
updateTheme();

function storageStatus() {
  document.querySelector('#storage-status').textContent = storageOK
    ? '' : 'No se puede garantizar el guardado. El progreso se conserva mientras esta página permanezca abierta.';
}
function recapUnlocked(records = answers) {
  return items.every(x => x.questions.every((q, i) => Number.isInteger(records[x.id]?.graded?.[i])));
}
function adopt(next) {
  const reset = next.generation !== state.generation;
  state = next;
  if(next.group)consulting=false;
  ({ answers, theme, started } = state);
  updateTheme();
  if (reset) {
    consulting=false;
    stopGPS();
    tab = 'welcome';
    selected = null;
  } else if (tab === 'recap' && !recapUnlocked()) {
    tab = 'results';
  } else if (!next.group && !consulting) {
    tab = 'welcome'; selected = null;
  } else if (next.group && started && tab === 'welcome') {
    tab = 'route';
  }
  return reset;
}
function syncView(reset = false) {
  if (pendingWrites) return;
  if (!reset && (tab === 'detail' || tab === 'recap') && syncDetail) syncDetail();
  else render();
  storageStatus();
}

// Serialize writes across tabs when Web Locks is available. Older browsers
// still merge the latest stored state for each individual mutation.
function persist(kind, change) {
  const generation = state.generation;
  pendingWrites++;
  const operation = async () => {
    let reset = false;
    const commit = () => {
      const latest = memoryOnly ? state : (readState() || state);
      const next = normalizedState(latest);
      if (kind === 'reset' || kind === 'theme' || generation === next.generation) {
        change(next);
        try {
          localStorage.setItem(key, JSON.stringify(next));
          storageOK = true;
          memoryOnly = false;
        } catch {
          storageOK = false;
          memoryOnly = true;
        }
      }
      reset = adopt(next);
    };
    // A lock serializes the synchronous read/modify/write. If unsupported
    // or denied, the same narrow merge remains the compatibility fallback.
    if (navigator.locks?.request && !memoryOnly) {
      let entered = false;
      try {
        await navigator.locks.request(key, () => { entered = true; commit(); });
      } catch (error) {
        if (entered) throw error;
        commit();
      }
    } else commit();
    return reset;
  };
  const result = writeQueue.then(operation);
  writeQueue = result.catch(() => {});
  return result.then(reset => {
    pendingWrites--;
    syncView(reset);
    return reset;
  }, () => {
    pendingWrites--;
    storageOK = false;
    storageStatus();
    return false;
  });
}
function answerRecord(next, x) {
  return next.answers[x.id] ||= {
    questions: x.questions.map(q => ({ text: q.text, options: q.options.slice() })),
  };
}
window.addEventListener('storage', event => {
  if (event.key !== key && event.key !== null) return;
  if (pendingWrites || memoryOnly) return;
  const next = readState();
  if (next) {
    storageOK = true;
    syncView(adopt(next));
  } else storageStatus();
});

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const item=id=>items.find(x=>x.id===id);const complete=x=>Array.isArray(answers[x.id]?.graded)&&x.questions.every((q,i)=>Number.isInteger(answers[x.id].graded[i]));const count=()=>items.filter(complete).length;const points=x=>x.questions.filter((q,i)=>q.correct===answers[x.id]?.graded?.[i]).length;const score=()=>items.reduce((sum,x)=>sum+points(x),0);const finished=()=>activities.every(complete);const totalQuestions=items.reduce((sum,x)=>sum+x.questions.length,0);const zones=[1,2,3,4].map(id=>item(id));
function hav(a,b,c,d){const r=Math.PI/180,h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)))}
function proximity(x) {
  if (!position) return 'Ubicación sin señal';
  const zone = zones[x.zone - 1];
  const distance = hav(position.latitude, position.longitude, zone.lat, zone.lon);
  const accuracy = position.accuracy;
  const approx = Math.round(distance / 10) * 10;
  if (accuracy > 60) return 'Señal poco precisa';
  const band = d => d < 25 ? 'En las inmediaciones' : d < 60 ? 'Muy cerca' : d <= 120 ? 'Acercándose' : 'Lejos';
  const lower = band(Math.max(0, distance - accuracy));
  const upper = band(distance + accuracy);
  const label = lower === upper ? lower : 'Proximidad incierta';
  const estimate = distance + accuracy < 10 ? 'A menos de 10 m' : approx === 0 ? 'En torno a la referencia' : `≈ ${approx} m`;
  return `${estimate} · ${label}`;
}
function gpsPanel(){return `<div class="gps-controls"><div class="row"><h3>Ubicación</h3><button id="gps" aria-pressed="${watch !== null}">${watch!==null?'Desactivar GPS':'Activar GPS'}</button></div><p id="gps-status" class="muted" role="status">${esc(gpsMessage)}</p><p class="muted" style="margin:0">Solo se usa en este dispositivo; no se guarda ni se envía. No es necesario para responder.</p></div>`}
const bounds = { north: 39.4770, south: 39.4725, west: -0.3761, east: -0.3719 };
const scale = 350 / (bounds.north - bounds.south);
const mapWidth = (bounds.east - bounds.west) * Math.cos(39.47 * Math.PI / 180) * scale;
function xy(lat, lon) {
  return [(lon - bounds.west) / (bounds.east - bounds.west) * mapWidth, (bounds.north - lat) * scale];
}
const mapBase = globalThis.VE_MAP || '';
const mapCaption = mapBase ? '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · Zonas numeradas en orden.' : 'Zonas numeradas en orden, norte arriba.';
function inscriptionPhotos(item) {
  const [detail, ...context] = item.photos || [];
  if (!detail) return { closeup: '', setting: '' };
  const figure = photo => `<figure class="photo">
    <a href="${esc(photo.src)}" target="_blank" rel="noopener" aria-label="Ampliar fotografía: ${esc(photo.alt)}">
      <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="${photo.width}" height="${photo.height}">
    </a>
    <figcaption><a href="${esc(photo.source)}">${esc(photo.author)}</a> · <a href="${esc(photo.licenseUrl)}">${esc(photo.license)}</a> · ${esc(photo.adaptation)}</figcaption>
  </figure>`;
  return {
    closeup: figure(detail),
    setting: context.length
      ? `<details><summary>Ver el conjunto en la fachada</summary>${context.map(figure).join('')}</details>`
      : '',
  };
}
function map(){const dots=zones.map(z=>{const [x,y]=xy(z.lat,z.lon);return `<g><circle class="dot" cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y+4}" text-anchor="middle">${z.zone}</text></g>`}).join('');let user='';if(position){const [x,y]=xy(position.latitude,position.longitude);if(x>=0&&x<=mapWidth&&y>=0&&y<=350)user=`<circle class="accuracy" cx="${x}" cy="${y}" r="${Math.min(200,position.accuracy/111195*scale)}"/><circle class="user" cx="${x}" cy="${y}" r="6"/>`;}return `<svg class="map" viewBox="0 0 ${mapWidth} 350" role="img" aria-label="Callejero del itinerario con cuatro zonas numeradas y el norte arriba">${mapBase}${dots}${user}<path d="M233 35 L233 16 M229 22 L233 16 L237 22" fill="none" stroke="currentColor" stroke-width="2"/><text x="233" y="12" text-anchor="middle" style="fill:currentColor">N</text></svg>`}
function progress(){return `<div class="row"><span>Inscripciones completadas</span><strong>${count()}/8</strong></div><div class="progress" role="progressbar" aria-label="Inscripciones completadas" aria-valuenow="${count()}" aria-valuemin="0" aria-valuemax="8"><span style="width:${count()/8*100}%"></span></div>`}
function inscriptionTypes(open = false) {
  return `<details class="inscription-types" ${open ? 'open' : ''}>
    <summary>Tipos de inscripciones</summary>
    <dl>
      <div><dt>Honorífica</dt><dd>Rinde homenaje a una persona. Busca su nombre, sus cargos o quién le dedica el monumento.</dd></div>
      <div><dt>Sepulcral</dt><dd>Conmemora a una persona fallecida. Puede indicar su edad o quién encargó el epitafio.</dd></div>
      <div><dt>Votiva</dt><dd>Se dedica a una divinidad como ofrenda. Busca el nombre del dios o de la diosa y el del dedicante.</dd></div>
    </dl>
  </details>`;
}

function renderWelcome() {
  main.innerHTML = `<section class="card welcome">
    <div class="welcome-monument" aria-hidden="true">
      <div class="welcome-monument-inner">
        <svg class="welcome-emblem" viewBox="0 0 100 76" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8 24 50 4 92 24Z M14 29H86 M20 33V62 M40 33V62 M60 33V62 M80 33V62 M14 66H86 M8 72H92"/></svg>
        <div class="welcome-wordmark">VALENTIA<span>EPIGRAPHICA</span></div>
      </div>
    </div>
    <div class="welcome-cenefa" aria-hidden="true"></div>
    <div class="welcome-body">
      <h2>Ocho inscripciones romanas</h2>
      <p>Recorre el centro de Valencia, lee cada inscripción en su lugar y responde tres o cuatro preguntas breves. Al terminar las ocho fichas, podrás realizar una recapitulación final.</p>
      <div class="welcome-facts"><div><strong aria-hidden="true">VIII</strong><span>8 inscripciones</span></div><div><strong aria-hidden="true">IV</strong><span>4 localizaciones</span></div></div>
      <form id="group-form" class="group-form">
<h3>Registro del grupo</h3><label for="group-school">Instituto</label><select id="group-school" required><option value="">Selecciona tu instituto</option>${Object.entries(competition.schools).map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')}</select>
<label for="group-code">Código de inscripción del profesor</label><input id="group-code" required maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="V7K4MX9A"><label for="group-names">Nombres de los miembros (uno por línea, de 2 a 6)</label><textarea id="group-names" rows="4" required placeholder="Manuel&#10;Andrea&#10;Juan" maxlength="260"></textarea><p class="muted">Solo nombres de pila. Se guardarán en este dispositivo y en el del profesor al entregar el resultado. Introduce exactamente los nombres registrados por el profesor. El código se comprobará al entregar el QR. Al enviar las respuestas de una inscripción quedarán guardadas. La corrección y la puntuación solo se mostrarán tras completar todas las actividades.</p>
${Object.keys(answers).length ? '<p class="note">El progreso anterior al registro no cuenta para la clasificación. Al comenzar se sustituirá por una actividad nueva.</p>' : ''}
<p id="group-error" role="alert"></p><button class="primary wide" type="submit">Empezar recorrido</button></form>
      <div class="consult-entry"><p class="muted">¿Solo quieres leer las inscripciones y consultar el mapa?</p><button id="consult-start" class="wide" type="button">Consultar sin registrarse</button></div>
      ${inscriptionTypes(true)}
    </div>
  </section>`;
  main.querySelector('#group-form').addEventListener('submit',event=>{
    event.preventDefault();
    const names=main.querySelector('#group-names').value.split(/\r?\n/).filter(n=>n.trim());
    const g=competition.group({id:crypto.randomUUID(),names,school:main.querySelector('#group-school').value,code:main.querySelector('#group-code').value.trim().toUpperCase()});
    if(!g){main.querySelector('#group-error').textContent='Comprueba el instituto, el código de inscripción y los nombres (de dos a seis, máximo 40 caracteres).';return;}
    main.querySelector('#group-form button').disabled=true;
    void persist('start',next=>{if(next.group)return;next.group=g;next.answers={};next.started=true;});
  });
}
function consultationBanner(){return '<div class="card consultation-banner"><strong>Modo consulta · sin registro</strong><p>Consulta el itinerario y las inscripciones. Para responder preguntas y participar en la clasificación, registra tu grupo.</p><button id="consult-register" class="wide" type="button">Registrar grupo</button></div>';}
function renderRoute() {
  const next = items.find(x => !complete(x));
  main.innerHTML = `<h2>Itinerario</h2>
    ${consulting?'<div class="card"><p>Explora las ocho inscripciones romanas y las cuatro localizaciones.</p><button class="primary wide" data-go="list">Ver todas las inscripciones</button></div>':`<div class="card">${progress()}
      ${next ? `<p class="next-stop"><strong>${next.roman} · ${esc(next.street)}</strong><br>${esc(next.title)}</p>
        <button class="primary wide" data-open="${next.id}">${next.id === 1 ? 'Abrir primera inscripción' : 'Abrir siguiente inscripción'}</button>`
      : '<p>Ocho inscripciones completadas.</p>' + (complete(recap) ? '<button class="primary wide" data-go="results">Ver resultados</button>' : '<button class="primary wide" data-go="recap">Recapitulación final</button>')}
    </div>`}
    <div class="card">
      ${inscriptionTypes()}
      <h3>Mapa del recorrido</h3>
      <div id="map">${map()}</div>
      <p class="muted">${mapCaption} El punto azul indica tu posición dentro del plano.</p>
      ${gpsPanel()}
      ${zones.map(z => `<div class="zone"><button data-open="${z.id}"><strong>${z.zone}. ${esc(z.street)}</strong><br><small>${z.zone === 4 ? 'IV–VIII · 5 inscripciones' : z.roman + ' · 1 inscripción'}</small></button><small data-distance="${z.id}">${proximity(z)}</small></div>`).join('')}
      <p class="note">El GPS indica la proximidad a la plaza. En la fachada, consulta la ubicación de cada ficha.</p>
    </div>`;
}
function renderList(){main.innerHTML=`<h2>Inscripciones</h2>${consulting?'':'<div class="card">'+progress()+'</div>'}${items.map(x=>`<button class="list-item" data-open="${x.id}"><span class="number">${x.roman}</span><span class="list-title"><strong>${esc(x.title)}</strong><small>${esc(x.street)} · ${esc(x.date)}</small></span><span class="${!consulting&&complete(x)?'done':'muted'}" aria-label="${consulting?'Consultar inscripción':complete(x)?'Completada':'Pendiente'}">${!consulting&&complete(x)?'✓':'›'}</span></button>`).join('')}`}
function formatLatinTerms(text) {
  return text.split('*').map((part, index) =>
    index % 2 ? `<i lang="la">${esc(part)}</i>` : esc(part)
  ).join('');
}

function transcription(item) {
  const fields = item.latin.split('\n\n');
  return `<div class="transcription">
    <div class="stone-frame stone-frame--${esc(item.frame)}">
      <div id="latin-text" class="epigraph" lang="la" tabindex="0" role="region" aria-label="Transcripción latina (desplazable si el texto no cabe)">
        <div class="inscription-fields">${fields.map(field => `<pre>${esc(field)}</pre>`).join('')}</div>
      </div>
    </div>
    <button id="enlarge-latin" type="button" aria-pressed="false" aria-controls="latin-text">Ampliar texto latino</button>
  </div>`;
}

function quizMarkup(x) {
  const draft = answers[x.id]?.draft || [];
  return `<form class="card" id="quiz"><h3>${x.id === recap.id ? "Preguntas de recapitulación" : "Actividades"}</h3>${x.questions.map((q,i)=>`<fieldset class="question"><legend>${i+1}. ${formatLatinTerms(q.text)}</legend>${competition.optionOrder(state.group.code,x.id,i,q.options.length).map(j=>`<label class="option"><input type="radio" name="q${i}" value="${j}" ${draft[i]===j?'checked':''} ${complete(x)?'disabled':''}><span>${esc(q.options[j])}</span></label>`).join('')}<p class="feedback" hidden></p></fieldset>`).join('')}<button class="primary wide" id="check" type="submit" ${!complete(x)&&x.questions.every((q,i)=>Number.isInteger(draft[i]))?'':'disabled'}>${complete(x)?'Respuestas enviadas':'Enviar respuestas'}</button><p class="done quiz-result" role="status"></p></form>`;
}
function renderDetail(){const x=item(selected);const {closeup,setting}=inscriptionPhotos(x);main.innerHTML=`<button class="back" data-go="list">‹ Todas las inscripciones</button><p class="muted" id="completion-status">${x.roman} · ${consulting?'Consulta':complete(x) ? "Actividad completada" : "Actividad pendiente"}</p><h2>${esc(x.title)}</h2><p class="muted">${esc(x.street)} · ${esc(x.date)}</p><div class="card"><div class="row"><strong data-distance="${x.id}">${proximity(x)}</strong><button id="gps" aria-pressed="${watch !== null}">${watch!==null?'Desactivar GPS':'Activar GPS'}</button></div><p id="gps-status" class="muted" role="status">${esc(gpsMessage)}</p><p class="muted">${esc(x.locationHint)}</p><p><a href="${esc(x.streetView)}" target="_blank" rel="noopener noreferrer">Ver la fachada en Street View</a></p><div class="inscription-display inscription-display--${esc(x.frame)}">${closeup}${transcription(x)}</div><details class="inscription-translation"><summary>Traducción</summary><p>${esc(x.translation)}</p></details><details><summary>Contexto histórico</summary><p>${formatLatinTerms(x.context)}</p></details>${setting}</div>${consulting?'':quizMarkup(x)}<div class="actions">${x.id>1?`<button data-open="${x.id-1}">‹ Anterior</button>`:''}${x.id<8?`<button class="next-inscription" data-open="${x.id+1}">Siguiente inscripción · ${item(x.id+1).roman}</button>` :consulting?`<button data-go="list">Todas las inscripciones</button>`:`<button data-go="results">Ver resultados ›</button>`}</div>`;
  if(!consulting)attachQuiz(x);
  const enlarge = document.querySelector('#enlarge-latin');
  const latin = document.querySelector('#latin-text');
  enlarge.addEventListener('click', () => {
    const enlarged = latin.classList.toggle('enlarged');
    enlarge.setAttribute('aria-pressed', String(enlarged));
    enlarge.textContent = enlarged ? 'Reducir texto latino' : 'Ampliar texto latino';
  });
}
function renderRecap() {
  if (!recapUnlocked()) { tab = 'results'; render(); return; }
  main.innerHTML = `<button class="back" data-go="results">‹ Resultados</button>
    <h2>Recapitulación final</h2>
    <p class="muted" id="completion-status">Recapitulación · ${complete(recap) ? 'Actividad completada' : 'Actividad pendiente'}</p>
    <p>Repasa lo aprendido en las ocho inscripciones. Cinco preguntas sobre morfología, sintaxis y lectura epigráfica.</p>
    ${quizMarkup(recap)}
    <div class="actions"><button data-go="results">Ver resultados ›</button></div>`;
  attachQuiz(recap);
}
function attachQuiz(x) {
  const a = answers[x.id] || {}, draft = a.draft || [];
  const graded = complete(x) && x.questions.every((q,i) => draft[i] === a.graded[i]);
  const form = document.querySelector('#quiz');
  const feedback = [...form.querySelectorAll('.feedback')];
  const result = form.querySelector('.quiz-result');
  const check = form.querySelector('#check');
  const nextButton = main.querySelector('.next-inscription');

  function showFeedback(gradedAnswers) {
    const submitted=complete(x);
    if(!finished())gradedAnswers=null;
    for(const input of form.querySelectorAll('input[type=radio]'))input.disabled=submitted;
    check.textContent=submitted?'Respuestas enviadas':'Enviar respuestas';
    check.disabled=submitted||!visibleAnswers().every(Number.isInteger);
    for (const [i, message] of feedback.entries()) {
      const question = x.questions[i];
      const correct = gradedAnswers?.[i] === question.correct;
      message.hidden = !gradedAnswers;
      message.className = gradedAnswers ? 'feedback ' + (correct ? 'correct' : 'incorrect') : 'feedback';
      message.innerHTML = gradedAnswers
        ? (correct ? 'Correcto. ' : 'Respuesta incorrecta. ') + formatLatinTerms(question.explanation)
        : '';
    }
    result.textContent = gradedAnswers
      ? x.questions.filter((q, i) => q.correct === gradedAnswers[i]).length + '/' + x.questions.length + ' respuestas correctas'
      : submitted?'Respuestas guardadas. La corrección se mostrará al terminar todas las actividades.':'';
    nextButton?.classList.toggle('primary', submitted);
  }

  function visibleAnswers() {
    return x.questions.map((q, i) => {
      const input = form.querySelector('input[name=q' + i + ']:checked');
      return input ? Number(input.value) : null;
    });
  }
  let renderedDraft = x.questions.map((q, i) => draft[i] ?? null);
  let renderedRecord = JSON.stringify(a);
  syncDetail = () => {
    const current = answers[x.id] || {};
    const fingerprint = JSON.stringify(current);
    // Completion of a different activity can unlock the final correction.
    if (fingerprint === renderedRecord) {showFeedback(complete(x)?current.graded:null);return;}
    renderedRecord = fingerprint;
    const values = x.questions.map((q, i) => current.draft?.[i] ?? null);
    const visible = visibleAnswers();
    // Only synchronize a group whose stored value actually changed.
    // A native radio activation can precede its change event, particularly
    // when a different tab is also committing progress. Never overwrite
    // an in-flight local choice with a previous persisted snapshot.
    for (const [i, value] of values.entries()) {
      if (value === visible[i] || (!complete(x) && (value === renderedDraft[i] || visible[i] !== renderedDraft[i]))) continue;
      const inputs = form.querySelectorAll('input[name=q' + i + ']');
      if (value === null) inputs.forEach(input => { input.checked = false; });
      else {
        const input = [...inputs].find(input => Number(input.value) === value);
        if (input) input.checked = true;
      }
    }
    renderedDraft = values;
    const displayed = visibleAnswers();
    check.disabled = !displayed.every(Number.isInteger);
    document.querySelector('#completion-status').textContent = x.roman + ' · ' +
      (complete(x) ? 'Actividad completada' : 'Actividad pendiente');
    showFeedback(complete(x) && displayed.every((value, i) => value === current.graded[i])
      ? current.graded : null);
  };
  showFeedback(graded ? draft : null);
  form.addEventListener('change', event => {
    if(complete(x))return;
    const i = Number(event.target.name.slice(1));
    const value = Number(event.target.value);
    if (!x.questions[i] || !Number.isInteger(value) || value < 0 || value >= x.questions[i].options.length) return;
    check.disabled = !visibleAnswers().every(Number.isInteger);
    showFeedback(null);
    void persist('answer', next => {
      if (x.id === recap.id && !recapUnlocked(next.answers)) return;
      const record = answerRecord(next, x);
      if(record.first?.every(Number.isInteger))return;
      (record.draft ||= Array(x.questions.length).fill(null))[i] = value;
      next.started = true;
    });
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if(complete(x))return;
    const values = visibleAnswers();
    if (!values.every((value, i) => Number.isInteger(value) && value >= 0 && value < x.questions[i].options.length)) return;
    // Grade precisely the choices the pupil saw on submitting.
    void persist('answer', next => {
      if (x.id === recap.id && !recapUnlocked(next.answers)) return;
      const record = answerRecord(next, x);
      if(record.first?.every(Number.isInteger))return;
      record.draft = values.slice();
      record.graded = values.slice();
      if (!record.first?.every(Number.isInteger)) record.first = values.slice();
      next.started = true;
    });
  });

}
function recapCard() {
  const unlocked = recapUnlocked();
  return `<div class="card" id="recap-card"><h3>Recapitulación final</h3>
    ${unlocked ? `<p>${complete(recap) ? 'Recapitulación completada.' : 'Cinco preguntas filológicas para terminar la actividad.'}</p>
      ${finished()?'<p class="muted">Puntuación de recapitulación: <strong id="recap-score">'+points(recap)+'/'+recap.questions.length+'</strong></p>':''}
      <button class="primary wide" data-go="recap">${complete(recap) ? 'Revisar recapitulación' : 'Hacer recapitulación'}</button>`
      : '<p class="muted">Se desbloquea al completar las ocho inscripciones.</p>'}</div>`;
}
function competitionCard(){
 const g=state.group;if(!g)return '';
 const header='<div class="card"><h3>Resultado del grupo</h3><p><strong>'+g.names.map(esc).join(', ')+'</strong><br>'+esc(competition.schools[g.school])+'</p>';
 if(!activities.every(complete))return header+'<p>Completa las ocho inscripciones y la recapitulación para obtener el QR.</p></div>';
 try{
  const code=competition.encode(g,answers),result=competition.decode(code),qr=qrcode(0,'M');qr.addData(code);qr.make();
  return header+'<p>Puntuación de clasificación (primer intento): <strong>'+result.score+'/'+competition.total+'</strong></p><div class="result-qr" id="result-qr">'+qr.createSvgTag({cellSize:4,margin:16,scalable:true})+'</div><p><strong>Entrega del resultado.</strong> Enseña el QR al profesor con el brillo de la pantalla alto y espera su confirmación. Puedes volver a esta pantalla cuando lo necesites, incluso sin conexión.</p><details><summary>Si la cámara no lee el QR</summary><p>Enseña el código de respaldo al profesor o copia el texto.</p><textarea readonly id="result-code" aria-label="Código de resultado">'+esc(code)+'</textarea><button type="button" id="copy-result" class="wide">Copiar código de resultado</button><p role="status" id="copy-status"></p></details></div>';
 }catch(e){return header+'<p role="alert">No se ha podido generar el código: '+esc(e.message)+'</p></div>';}
}
function renderResults(){main.innerHTML=`<h2>Resultados</h2>${finished()?competitionCard():''}<div class="card">${progress()}${finished()?'<p class="muted">Puntuación de las inscripciones</p><div class="score">'+score()+'/'+totalQuestions+'</div>':'<p class="muted" id="pending-correction">La puntuación y la corrección se mostrarán al completar las ocho inscripciones y la recapitulación.</p>'}<p>${count()===8?'Ocho inscripciones completadas.':'Puedes continuar en cualquier momento.'}</p></div>${recapCard()}<div class="card">${items.map(x=>`<div class="zone"><button data-open="${x.id}">${x.roman}. ${esc(x.title)}</button><strong>${finished()?points(x)+'/'+x.questions.length:complete(x)?'Entregada':'Pendiente'}</strong></div>`).join('')}</div>${finished()?'':competitionCard()}`}
function render(){syncDetail=null;document.querySelector("nav").hidden=tab==="welcome";document.querySelector('nav [data-tab=results]').hidden=consulting;document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===(tab==='detail'?'list':tab==='recap'?'results':tab)?'page':'false'));({welcome:renderWelcome,route:renderRoute,list:renderList,detail:renderDetail,recap:renderRecap,results:renderResults}[tab])();if(consulting&&tab!=='welcome')main.insertAdjacentHTML('afterbegin',consultationBanner());if(!storageOK)document.querySelector('#storage-status').textContent='No se pudo acceder al progreso guardado en este dispositivo.'}
async function go(t, id) {
  if (t === 'recap' && !recapUnlocked()) return;
  if (!state.group && t !== 'welcome' && (!consulting||!['route','list','detail'].includes(t))) return;
  if(t==='detail'&&!item(id))return;
  if (t !== 'route' && t !== 'detail' && watch !== null) stopGPS();
  tab = t;
  selected = id || null;
  render();
  scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function refreshGPS() {
  const status = document.querySelector('#gps-status');
  if (status) status.textContent = gpsMessage;
  document.querySelectorAll('[data-distance]').forEach(el => {
    el.textContent = proximity(item(Number(el.dataset.distance)));
  });
  const mapNode = document.querySelector('#map');
  if (mapNode) mapNode.innerHTML = map();
  const button = document.querySelector('#gps');
  if (button) {
    button.textContent = watch === null ? 'Activar GPS' : 'Desactivar GPS';
    button.setAttribute('aria-pressed', String(watch !== null));
  }
}
function stopGPS(message = 'Ubicación desactivada. Puedes seguir con las actividades.') {
  gpsGeneration++;
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  position = null;
  gpsMessage = message;
  refreshGPS();
}
function beginWatch(highAccuracy) {
  const generation = ++gpsGeneration;
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  try {
    watch = navigator.geolocation.watchPosition(p => {
      if (generation !== gpsGeneration) return;
      const coords = p.coords;
      if (![coords.latitude, coords.longitude, coords.accuracy].every(Number.isFinite) || coords.accuracy < 0) {
        stopGPS('No se ha obtenido ubicación fiable. Puedes volver a activar el GPS.');
        return;
      }
      position = coords;
      gpsMessage = `Precisión estimada: ±${Math.round(coords.accuracy)} m.` +
        (coords.accuracy > 35 ? ' Señal poco precisa; usa las referencias de la calle.' : '');
      if (!highAccuracy && coords.accuracy > 35) beginWatch(true);
      refreshGPS();
    }, error => {
      if (generation !== gpsGeneration) return;
      if (error.code !== 1 && !highAccuracy) {
        gpsMessage = 'Buscando una ubicación más precisa…';
        beginWatch(true);
        return;
      }
      stopGPS(error.code === 1 ? 'Permiso denegado. Puedes continuar sin GPS.'
        : 'No se ha obtenido ubicación fiable. Puedes volver a activar el GPS.');
    }, { enableHighAccuracy: highAccuracy, maximumAge: 5000, timeout: 15000 });
  } catch {
    stopGPS('Ubicación no disponible. Puedes continuar sin GPS.');
  }
  refreshGPS();
}
function startGPS() {
  if (watch !== null) { stopGPS(); return; }
  if (!navigator.geolocation || !isSecureContext) {
    gpsMessage = 'Ubicación no disponible. Abre la web mediante HTTPS o localhost.';
    refreshGPS();
    return;
  }
  gpsMessage = 'Buscando tu ubicación…';
  beginWatch(false);
}
document.addEventListener('click', event => {
  if(event.target.closest('#copy-result')){const field=document.querySelector('#result-code'),message=document.querySelector('#copy-status');if(!field)return;field.focus();field.select();if(navigator.clipboard?.writeText){navigator.clipboard.writeText(field.value).then(()=>{message.textContent='Código copiado.';}).catch(()=>{message.textContent='Texto seleccionado. Usa Copiar en el menú del dispositivo.';});}else message.textContent='Texto seleccionado. Usa Copiar en el menú del dispositivo.';return;}
  const b = event.target.closest('button');
  if (!b) return;
  if(b.id==='consult-start'&&!state.group){consulting=true;void go('route');}
  else if(b.id==='consult-register'&&consulting){consulting=false;void go('welcome');}
  else if (b.dataset.tab) void go(b.dataset.tab);
  else if (b.dataset.go) void go(b.dataset.go);
  else if (b.dataset.open) void go('detail', Number(b.dataset.open));
  else if (b.id === 'gps') startGPS();
  else if (b.id === 'theme') {
    void persist('theme', next => {
      next.theme = themes[(themes.indexOf(next.theme) + 1) % themes.length];
    });
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && watch !== null) stopGPS();
  if (!document.hidden && !pendingWrites && !memoryOnly) {
    const next = readState();
    if (next && JSON.stringify(next) !== JSON.stringify(state)) syncView(adopt(next));
  }
});
render();
storageStatus();

// The guide never navigates, saves or resets student progress.
const guide=document.querySelector('#student-guide'),guideButton=document.querySelector('#how-it-works');
guideButton.addEventListener('click',()=>{
 const stage=consulting?'consult':!state.group?'register':finished()?'delivery':count()===8?'recap':tab==='detail'?'questions':'route';
 const messages={consult:'Ahora: consultad el mapa y las inscripciones. Para participar, volved al registro del grupo.',register:'Ahora: registrad vuestro grupo.',route:'Ahora: seguid el itinerario y completad las inscripciones pendientes.',questions:'Ahora: revisad vuestras respuestas y enviad la ficha cuando esté completa.',recap:'Ahora: completad la recapitulación final.',delivery:'Ahora: mostrad el QR al profesor y esperad su confirmación.'};
 document.querySelector('#guide-current').textContent=messages[stage];
 for(const step of guide.querySelectorAll('[data-stage]')){
  if(step.dataset.stage===stage)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');
 }
 guide.showModal();guide.querySelector('.guide-content').scrollTop=0;
});
document.querySelector('#close-guide').addEventListener('click',()=>guide.close());
document.querySelector('#guide-done').addEventListener('click',()=>guide.close());
guide.addEventListener('close',()=>guideButton.focus({preventScroll:true}));


const offlineStatus = document.querySelector('#offline-status');
let offlineCheck = 0;
let installTimer;
function offlineUnavailable() {
  offlineStatus.textContent = 'Descarga sin conexión no disponible';
}
function verifyOffline() {
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;
  clearTimeout(installTimer);
  const check = ++offlineCheck;
  const channel = new MessageChannel();
  const finish = complete => {
    clearTimeout(timeout);
    channel.port1.close();
    if (check !== offlineCheck) return;
    if (complete) offlineStatus.textContent = 'Disponible sin conexión';
    else offlineUnavailable();
  };
  const timeout = setTimeout(() => finish(false), 5000);
  channel.port1.onmessage = event => finish(event.data?.complete === true);
  try { controller.postMessage({ type: 'VERIFY_OFFLINE' }, [channel.port2]); }
  catch { finish(false); }
}
if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.addEventListener('controllerchange', verifyOffline);
  installTimer = setTimeout(offlineUnavailable, 20000);
  if (navigator.serviceWorker.controller) verifyOffline();
  navigator.serviceWorker.register('./sw.js').then(registration => {
    if (navigator.serviceWorker.controller) verifyOffline();
    const observe = worker => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && !navigator.serviceWorker.controller) offlineUnavailable();
      });
    };
    observe(registration.installing);
    registration.addEventListener('updatefound', () => observe(registration.installing));
  }).catch(() => {
    if (!navigator.serviceWorker.controller) offlineUnavailable();
  });
  window.addEventListener('online', verifyOffline);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) verifyOffline();
  });
} else offlineUnavailable();

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
