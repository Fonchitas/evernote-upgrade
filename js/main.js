/* ============================================================
   EVERNOTE UPGRADE · interacciones · v2
   Cada interacción tiene versión ratón y versión dedo.
   1. Nota clonada en cada pantalla
   2. Sin palabras huérfanas
   3. Interruptor Free / Personal (clic, toque o deslizar)
   4. Parallax de las tarjetas (ratón en escritorio, scroll en móvil)
   5. Un día: scroll fijado en escritorio, carrusel en móvil
   6. Índice: hover en escritorio, fila central en móvil
   7. Barra flotante
   8. Hoja de confirmación (arrastrable en móvil)
   ============================================================ */
(() => {
  const mq = (q) => window.matchMedia(q);
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  const finePointer = mq('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;

  /* ---------- 1. La misma nota en todos los dispositivos ---------- */
  const tpl = document.getElementById('note-tpl');
  document.querySelectorAll('[data-screen]').forEach((screen) => {
    screen.appendChild(tpl.content.cloneNode(true));
  });

  /* ---------- 2. Sin palabras huérfanas ----------
     Une las dos últimas palabras con un espacio que no se parte.
     Complementa a text-wrap en navegadores que aún no lo soportan. */
  function noOrphan(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const text = nodes[i].nodeValue.replace(/\s+$/, '');
      const idx = text.lastIndexOf(' ');
      if (idx > 0) {
        nodes[i].nodeValue = text.slice(0, idx) + ' ' + text.slice(idx + 1);
        return;
      }
      if (text.trim()) return; // la última palabra está sola en su nodo: no tocar
    }
  }
  document.querySelectorAll('main h1, main h2, main h3, main p, main li, main summary, main .textlink, .dock__text, .sheet p')
    .forEach((el) => {
      if (el.closest('.note, .device, .day__dots, .tag')) return;
      if (el.textContent.trim().split(/\s+/).length >= 4) noOrphan(el);
    });

  /* ---------- 3. Interruptor Free / Personal ---------- */
  const stage = document.getElementById('stage');
  const devices = document.getElementById('devices');
  const options = stage.querySelectorAll('.switch__opt');
  const note = stage.querySelector('.counter__note');
  const notes = { free: '1 device on Evernote\u00A0Free', personal: 'Unlimited devices with\u00A0Personal' };
  let userTouched = false;
  let syncTimer;

  function setPlan(plan) {
    if (stage.dataset.plan === plan) return;
    stage.dataset.plan = plan;
    options.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.set === plan)));
    note.textContent = notes[plan];
    clearTimeout(syncTimer);
    stage.classList.remove('is-syncing');
    if (plan === 'personal') {
      void stage.offsetWidth; // reinicia el pulso
      stage.classList.add('is-syncing');
      syncTimer = setTimeout(() => stage.classList.remove('is-syncing'), 1600);
      if (navigator.vibrate && !finePointer.matches) navigator.vibrate(12);
    }
  }
  const toggle = () => setPlan(stage.dataset.plan === 'free' ? 'personal' : 'free');

  options.forEach((btn) => btn.addEventListener('click', () => { userTouched = true; setPlan(btn.dataset.set); }));

  // Toque o deslizamiento sobre los dispositivos
  let startX = null, startY = null;
  devices.addEventListener('pointerdown', (e) => { startX = e.clientX; startY = e.clientY; });
  devices.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    startX = null;
    userTouched = true;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) setPlan(dx < 0 ? 'personal' : 'free');
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) toggle();
  });
  devices.addEventListener('pointercancel', () => { startX = null; });

  // Arranca en Free y pasa solo a Personal una vez
  // (espera a que termine la entrada de la escena)
  setTimeout(() => { if (!userTouched) setPlan('personal'); }, reduceMotion.matches ? 600 : 2600);

  /* ---------- 4. Parallax de las formas ---------- */
  let mx = 0, my = 0, rafShapes = 0;
  const writeShapes = () => {
    rafShapes = 0;
    root.style.setProperty('--mx', mx.toFixed(3));
    root.style.setProperty('--my', my.toFixed(3));
  };
  const queueShapes = () => { if (!rafShapes) rafShapes = requestAnimationFrame(writeShapes); };

  window.addEventListener('pointermove', (e) => {
    if (!finePointer.matches || reduceMotion.matches) return;
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
    queueShapes();
  }, { passive: true });

  // En móvil no hay cursor: las formas respiran con el scroll
  window.addEventListener('scroll', () => {
    if (finePointer.matches || reduceMotion.matches) return;
    const t = window.scrollY / 380;
    mx = Math.sin(t) * 0.7;
    my = Math.cos(t * 0.8) * 0.9;
    queueShapes();
  }, { passive: true });

  /* ---------- 5. Un día ---------- */
  const day = document.getElementById('day');
  const viewport = document.getElementById('day-viewport');
  const track = document.getElementById('day-track');
  const bar = document.getElementById('day-bar');
  const moments = [...track.children];
  const dots = [...day.querySelectorAll('.day__dot')];
  const pinned = mq('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
  let current = -1;

  function setMoment(i) {
    if (i === current) return;
    current = i;
    day.dataset.moment = String(i);
    dots.forEach((d, n) => d.setAttribute('aria-selected', String(n === i)));
  }

  // Escritorio: el scroll vertical mueve el recorrido en horizontal
  let rafDay = 0;
  function updatePinned() {
    rafDay = 0;
    if (!pinned.matches) { track.style.transform = ''; return; }
    const rect = day.getBoundingClientRect();
    const scrollable = day.offsetHeight - window.innerHeight;
    const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
    const last = moments[moments.length - 1];
    const padRight = parseFloat(getComputedStyle(track).paddingLeft);
    const distance = Math.max(0, last.offsetLeft + last.offsetWidth + padRight - window.innerWidth);
    track.style.transform = `translate3d(${-progress * distance}px, 0, 0)`;
    bar.style.transform = `scaleX(${progress})`;
    day.style.setProperty('--dp', progress.toFixed(3));   // gira las formas de cada momento
    setMoment(Math.min(moments.length - 1, Math.round(progress * (moments.length - 1))));
  }
  const queueDay = () => { if (!rafDay) rafDay = requestAnimationFrame(updatePinned); };
  window.addEventListener('scroll', queueDay, { passive: true });
  window.addEventListener('resize', queueDay);
  pinned.addEventListener('change', queueDay);
  updatePinned();

  // Móvil: carrusel nativo; la tarjeta centrada marca la hora
  function updateSwipe() {
    if (pinned.matches) return;
    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    moments.forEach((m, n) => {
      const d = Math.abs(m.offsetLeft + m.offsetWidth / 2 - center);
      if (d < bestDist) { bestDist = d; best = n; }
    });
    setMoment(best);
    const max = viewport.scrollWidth - viewport.clientWidth;
    if (max > 0) day.style.setProperty('--dp', (viewport.scrollLeft / max).toFixed(3));
  }
  viewport.addEventListener('scroll', () => requestAnimationFrame(updateSwipe), { passive: true });

  // Las horas son botones: llevan a su momento en cualquier formato
  dots.forEach((dot) => dot.addEventListener('click', () => {
    const i = Number(dot.dataset.go);
    const behavior = reduceMotion.matches ? 'auto' : 'smooth';
    if (pinned.matches) {
      const top = day.offsetTop + (day.offsetHeight - window.innerHeight) * (i / (moments.length - 1));
      window.scrollTo({ top, behavior });
    } else {
      const m = moments[i];
      viewport.scrollTo({ left: m.offsetLeft - (viewport.clientWidth - m.offsetWidth) / 2, behavior });
    }
  }));
  setMoment(0);

  /* ---------- 5b. Progreso de scroll para motion ([data-progress] → --p) ---------- */
  // 0 cuando el bloque asoma por abajo, 1 cuando sale por arriba.
  const tracked = [...document.querySelectorAll('[data-progress]')];
  let rafP = 0;
  function updateProgress() {
    rafP = 0;
    if (reduceMotion.matches) return;
    const vh = window.innerHeight;
    tracked.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      el.style.setProperty('--p', p.toFixed(3));
    });
  }
  window.addEventListener('scroll', () => { if (!rafP) rafP = requestAnimationFrame(updateProgress); }, { passive: true });
  updateProgress();

  /* ---------- 6. Índice ---------- */
  const index = document.getElementById('index');
  const rows = [...index.querySelectorAll('.index__row')];
  function focusRow(row) {
    rows.forEach((r) => r.classList.toggle('is-focus', r === row));
    index.classList.toggle('has-focus', Boolean(row));
  }

  // Ratón: hover
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => { if (finePointer.matches) focusRow(row); });
  });
  index.addEventListener('mouseleave', () => { if (finePointer.matches) focusRow(null); });

  // Dedo: se activa la fila que cruza la franja central de la pantalla
  const centerBand = new IntersectionObserver((entries) => {
    if (finePointer.matches) return;
    entries.forEach((entry) => { if (entry.isIntersecting) focusRow(entry.target); });
  }, { rootMargin: '-46% 0px -46% 0px' });
  rows.forEach((row) => centerBand.observe(row));
  new IntersectionObserver(([entry]) => {
    if (!finePointer.matches && !entry.isIntersecting) focusRow(null);
  }).observe(index);

  /* ---------- 7. Barra flotante ---------- */
  // Se ve siempre, salvo cuando ya hay un botón de compra en pantalla.
  const dock = document.getElementById('dock');
  const dockBtn = dock.querySelector('button');
  const watched = [document.getElementById('hero-actions'), document.getElementById('plans'), document.getElementById('close')];
  const visible = new Set();
  new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    const show = visible.size === 0;
    dock.classList.toggle('is-visible', show);
    dockBtn.tabIndex = show ? 0 : -1;
  }, { threshold: 0.05 }).observe(watched[0]);
  // (un observador por elemento para no perder entradas iniciales)
  watched.slice(1).forEach((el) => {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      const show = visible.size === 0;
      dock.classList.toggle('is-visible', show);
      dockBtn.tabIndex = show ? 0 : -1;
    }, { threshold: 0.05 }).observe(el);
  });

  /* ---------- 8. Hoja de confirmación ---------- */
  // Todo sale de la tabla del brief.
  const plans = {
    personal: {
      name: 'Personal', price: '€7.99/month',
      items: ['Unlimited devices synced', 'Offline access', 'AI-powered search', 'PDF annotation', 'Full tasks & reminders', '100 GB monthly uploads, 200 MB per note'],
    },
    professional: {
      name: 'Professional', price: '€14.99/month per seat',
      items: ['Everything in Personal', 'Team collaboration', 'Admin & user management', '2 TB monthly uploads, 500 MB per note'],
    },
  };
  const sheet = document.getElementById('sheet');
  const sheetInner = sheet.querySelector('.sheet__inner');

  document.querySelectorAll('[data-checkout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = plans[btn.dataset.checkout];
      document.getElementById('sheet-title').textContent = plan.name;
      document.getElementById('sheet-price').textContent = plan.price;
      document.getElementById('sheet-list').replaceChildren(...plan.items.map((t) => {
        const li = document.createElement('li'); li.textContent = t; return li;
      }));
      sheetInner.style.transform = '';
      if (typeof sheet.showModal === 'function') sheet.showModal();
    });
  });
  sheet.addEventListener('close', () => {
    if (sheet.returnValue === 'back') {
      document.getElementById('plans').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  // Móvil: arrastrar la hoja hacia abajo para cerrarla
  const grab = sheet.querySelector('.sheet__grab');
  let dragY = null;
  grab.addEventListener('pointerdown', (e) => { dragY = e.clientY; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', (e) => {
    if (dragY === null) return;
    sheetInner.style.transform = `translateY(${Math.max(0, e.clientY - dragY)}px)`;
  });
  grab.addEventListener('pointerup', (e) => {
    if (dragY === null) return;
    const moved = e.clientY - dragY; dragY = null;
    if (moved > 80) sheet.close(); else sheetInner.style.transform = '';
  });
})();
