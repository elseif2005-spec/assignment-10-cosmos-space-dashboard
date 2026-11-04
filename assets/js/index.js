'use strict';

/* =====================================================
   CONFIG  -  put the URLs from the Postman docs here
   ===================================================== */
const CONFIG = {
    // 1) NASA APOD
    NASA_KEY: 'DEMO_KEY',
    APOD_URL: 'https://api.nasa.gov/planetary/apod',

    // 2) SpaceDevs Launch Library 2 (upcoming launches)
    LAUNCHES_URL: 'https://lldev.thespacedevs.com/2.3.0/launches/upcoming/?limit=10',

    // 3) Solar System OpenData proxy (returns ALL planets in one request)
    PLANETS_URL: 'https://solar-system-opendata-proxy.vercel.app/api/planets',
};

/* =====================================================
   Helpers
   ===================================================== */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));

const fmt = (n, d = 0) =>
    Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

const sup = (n) =>
    String(n).replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'[c === '-' ? 0 : Number(c) + 1]);

const pad2 = (n) => String(n).padStart(2, '0');

// fetch + JSON + optional cache (protects the API rate limits)
async function getJSON(url, ttlMs = 0) {
    const key = `cache:${url}`;
    if (ttlMs) {
        try {
            const c = JSON.parse(sessionStorage.getItem(key));
            if (c && Date.now() - c.t < ttlMs) return c.d;
        } catch { /* ignore */ }
    }
    const res = await fetch(url);
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json();
    if (ttlMs) {
        try {
            sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
        } catch { /* ignore */ }
    }
    return data;
}

function errorMessage(err) {
    if (err.status === 429) return 'Too many requests. Please wait a bit and try again.';
    if (err.status === 404 || err.status === 400) return 'No data found for this request.';
    if (!navigator.onLine) return 'You appear to be offline.';
    return `Something went wrong while loading data (${err.status || err.message}). Please try again.`;
}

const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

function parseYMD(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

const longDate = (str) =>
    parseYMD(str).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const shortDate = (str) =>
    parseYMD(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

/* =====================================================
   Navigation (sidebar sections)
   ===================================================== */
const sidebar = $('#sidebar');
const sidebarToggle = $('#sidebar-toggle');
const navLinks = $$('.nav-link');
const sections = $$('.app-section');

const NAV_ON = ['bg-blue-500/10', 'text-blue-400'];
const NAV_OFF = ['text-slate-300', 'hover:bg-slate-800'];
const isMobile = () => window.innerWidth < 1024;

function showSection(id) {
    sections.forEach((s) => s.classList.toggle('hidden', s.dataset.section !== id));
    navLinks.forEach((a) => {
        const on = a.dataset.section === id;
        NAV_ON.forEach((c) => a.classList.toggle(c, on));
        NAV_OFF.forEach((c) => a.classList.toggle(c, !on));
    });
    window.scrollTo({ top: 0 });

    if (id === 'launches') initLaunches();
    if (id === 'planets') initPlanets();
}

navLinks.forEach((a) =>
    a.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(a.dataset.section);
        if (isMobile()) setSidebar(false);
    })
);

// Mobile sidebar (inline styles so it works with any CSS setup)
function setSidebar(open) {
    if (!isMobile()) {
        sidebar.style.transform = '';
        return;
    }
    sidebar.style.transform = open ? 'translateX(0)' : 'translateX(-100%)';
    sidebar.dataset.open = String(open);
}

sidebarToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setSidebar(sidebar.dataset.open !== 'true');
});
document.addEventListener('click', (e) => {
    if (isMobile() && sidebar.dataset.open === 'true' && !sidebar.contains(e.target)) {
        setSidebar(false);
    }
});
window.addEventListener('resize', () => setSidebar(false));
setSidebar(false);

/* =====================================================
   1) Today in Space (NASA APOD)
   ===================================================== */
const apod = {
    dateInput: $('#apod-date-input'),
    dateLabel: $('.date-input-wrapper span'),
    loadBtn: $('#load-date-btn'),
    todayBtn: $('#today-apod-btn'),
    container: $('#apod-image-container'),
    loading: $('#apod-loading'),
    image: $('#apod-image'),
    title: $('#apod-title'),
    headDate: $('#apod-date'),
    dateDetail: $('#apod-date-detail'),
    explanation: $('#apod-explanation'),
    copyright: $('#apod-copyright'),
    dateInfo: $('#apod-date-info'),
    mediaType: $('#apod-media-type'),
};
apod.overlay = $('div.absolute', apod.container);
apod.fullBtn = $('button', apod.container);

let apodRequestId = 0;
let apodHdUrl = null;

function setApodLoading(on) {
    apod.loading.classList.toggle('hidden', !on);
    if (on) {
        apod.image.classList.add('hidden');
        $('#apod-video', apod.container)?.remove();
    }
}

function renderApod(data) {
    $('#apod-video', apod.container)?.remove();

    const isVideo = data.media_type === 'video';
    apodHdUrl = data.hdurl || data.url;

    if (isVideo) {
        apod.image.classList.add('hidden');
        apod.overlay.classList.add('hidden');
        if (/youtube|vimeo|youtu\.be/.test(data.url)) {
            const frame = document.createElement('iframe');
            frame.id = 'apod-video';
            frame.src = data.url;
            frame.title = data.title;
            frame.allowFullscreen = true;
            frame.className = 'w-full h-full';
            apod.container.insertBefore(frame, apod.overlay);
        } else if (data.thumbnail_url) {
            apod.image.src = data.thumbnail_url;
            apod.image.alt = data.title;
            apod.image.classList.remove('hidden');
        }
    } else {
        apod.overlay.classList.remove('hidden');
        apod.image.src = data.url;
        apod.image.alt = data.title;
        apod.image.classList.remove('hidden');
    }

    apod.title.textContent = data.title;
    apod.headDate.textContent = `Astronomy Picture of the Day - ${longDate(data.date)}`;
    apod.dateDetail.innerHTML = `<i class="far fa-calendar mr-2"></i>${esc(data.date)}`;
    apod.explanation.textContent = data.explanation;
    apod.copyright.innerHTML = data.copyright
        ? `&copy; ${esc(data.copyright.replace(/\s+/g, ' ').trim())}`
        : 'Public domain (NASA)';
    apod.dateInfo.textContent = data.date;
    apod.mediaType.textContent = isVideo ? 'Video' : 'Image';

    apod.dateInput.value = data.date;
    apod.dateLabel.textContent = shortDate(data.date);
}

function renderApodError(err) {
    apod.title.textContent = "Couldn't load the picture";
    apod.explanation.textContent = errorMessage(err);
    apod.copyright.textContent = '';
    apod.image.classList.add('hidden');
}

async function loadApod(date) {
    const id = ++apodRequestId;
    setApodLoading(true);
    try {
        const params = new URLSearchParams({ api_key: CONFIG.NASA_KEY, thumbs: 'true' });
        if (date) params.set('date', date);
        const data = await getJSON(`${CONFIG.APOD_URL}?${params}`, 10 * 60 * 1000);
        if (id !== apodRequestId) return; // an older request, ignore it
        renderApod(data);
    } catch (err) {
        if (id === apodRequestId) renderApodError(err);
    } finally {
        if (id === apodRequestId) apod.loading.classList.add('hidden');
    }
}

apod.dateInput.max = todayLocal();

apod.dateInput.addEventListener('change', () => {
    if (apod.dateInput.value) apod.dateLabel.textContent = shortDate(apod.dateInput.value);
});
apod.loadBtn.addEventListener('click', () => {
    const value = apod.dateInput.value;
    if (!value) return;
    if (value < apod.dateInput.min || value > apod.dateInput.max) return;
    loadApod(value);
});
// No date param = NASA returns its latest picture (safe with time zones)
apod.todayBtn.addEventListener('click', () => loadApod());
apod.fullBtn.addEventListener('click', () => {
    if (apodHdUrl) window.open(apodHdUrl, '_blank', 'noopener');
});

/* =====================================================
   2) Launches (SpaceDevs)
   ===================================================== */
const featuredBox = $('#featured-launch');
const launchesGrid = $('#launches-grid');
const countDesktop = $('#launches-count');
const countMobile = $('#launches-count-mobile');

const STATUS_COLORS = {
    go: ['rgba(34,197,94,.9)', '#fff'],
    success: ['rgba(34,197,94,.9)', '#fff'],
    tbc: ['rgba(234,179,8,.9)', '#fff'],
    tbd: ['rgba(59,130,246,.9)', '#fff'],
    hold: ['rgba(249,115,22,.9)', '#fff'],
    failure: ['rgba(239,68,68,.9)', '#fff'],
    'partial failure': ['rgba(239,68,68,.9)', '#fff'],
    'in flight': ['rgba(168,85,247,.9)', '#fff'],
};

function statusBadge(status, extraClass = 'px-3 py-1 text-xs') {
    const [bg, color] = STATUS_COLORS[String(status).toLowerCase()] || ['rgba(100,116,139,.9)', '#fff'];
    return `<span class="${extraClass} rounded-full font-semibold backdrop-blur-sm" style="background:${bg};color:${color}">${esc(status)}</span>`;
}

function normalizeLaunch(l) {
    const img = l.image?.image_url || (typeof l.image === 'string' ? l.image : null);
    return {
        name: l.name || 'Unknown launch',
        status: l.status?.abbrev || l.status?.name || 'TBD',
        net: l.net || l.window_start || null,
        provider: l.launch_service_provider?.name || 'Unknown',
        rocket: l.rocket?.configuration?.full_name || l.rocket?.configuration?.name || '—',
        pad: l.pad?.name || 'Unknown pad',
        location: l.pad?.location?.name || 'Unknown location',
        country:
            l.pad?.location?.country?.alpha_3_code ||
            l.pad?.location?.country_code ||
            l.pad?.country?.alpha_3_code ||
            l.pad?.location?.country?.name ||
            '—',
        image: img,
        description: l.mission?.description || 'No mission description available yet.',
    };
}

function launchDateTime(net) {
    if (!net) return { date: 'TBD', time: 'TBD' };
    const d = new Date(net);
    if (Number.isNaN(d.getTime())) return { date: 'TBD', time: 'TBD' };
    return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
        time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`,
    };
}

function countdown(net) {
    if (!net) return { value: 'TBD', label: 'Launch time to be determined' };
    const diff = new Date(net) - Date.now();
    if (Number.isNaN(diff)) return { value: 'TBD', label: 'Launch time to be determined' };
    if (diff < 0) return { value: '0', label: 'Launch window open / passed' };
    const days = Math.floor(diff / 86400000);
    if (days >= 1) return { value: days, label: days === 1 ? 'Day Until Launch' : 'Days Until Launch' };
    const hours = Math.floor(diff / 3600000);
    return { value: hours, label: hours === 1 ? 'Hour Until Launch' : 'Hours Until Launch' };
}

function featuredHTML(l) {
    const dt = launchDateTime(l.net);
    const cd = countdown(l.net);
    const media = l.image
        ? `<img class="w-full h-full min-h-[400px] object-cover" src="${esc(l.image)}" alt="${esc(l.name)}" loading="lazy" />`
        : `<div class="flex items-center justify-center h-full min-h-[400px] bg-slate-800"><i class="fas fa-rocket text-9xl text-slate-700/50"></i></div>`;

    return `
    <div class="relative bg-slate-800/30 border border-slate-700 rounded-3xl overflow-hidden group hover:border-blue-500/50 transition-all">
      <div class="absolute inset-0 bg-linear-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative grid grid-cols-1 lg:grid-cols-2 gap-6 p-8">
        <div class="flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-3 mb-4">
              <span class="px-4 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold flex items-center gap-2">
                <i class="fas fa-star"></i> Featured Launch
              </span>
              ${statusBadge(l.status, 'px-4 py-1.5 text-sm')}
            </div>
            <h3 class="text-3xl font-bold mb-3 leading-tight">${esc(l.name)}</h3>
            <div class="flex flex-col xl:flex-row xl:items-center gap-4 mb-6 text-slate-400">
              <div class="flex items-center gap-2"><i class="fas fa-building"></i><span>${esc(l.provider)}</span></div>
              <div class="flex items-center gap-2"><i class="fas fa-rocket"></i><span>${esc(l.rocket)}</span></div>
            </div>
            <div class="inline-flex items-center gap-3 px-6 py-3 bg-linear-to-r from-blue-500/20 to-purple-500/20 rounded-xl mb-6">
              <i class="fas fa-clock text-2xl text-blue-400"></i>
              <div>
                <p class="text-2xl font-bold text-blue-400">${esc(cd.value)}</p>
                <p class="text-xs text-slate-400">${esc(cd.label)}</p>
              </div>
            </div>
            <div class="grid xl:grid-cols-2 gap-4 mb-6">
              <div class="bg-slate-900/50 rounded-xl p-4">
                <p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-calendar"></i> Launch Date</p>
                <p class="font-semibold">${esc(dt.date)}</p>
              </div>
              <div class="bg-slate-900/50 rounded-xl p-4">
                <p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-clock"></i> Launch Time</p>
                <p class="font-semibold">${esc(dt.time)}</p>
              </div>
              <div class="bg-slate-900/50 rounded-xl p-4">
                <p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-map-marker-alt"></i> Location</p>
                <p class="font-semibold text-sm">${esc(l.location)}</p>
              </div>
              <div class="bg-slate-900/50 rounded-xl p-4">
                <p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-globe"></i> Country</p>
                <p class="font-semibold">${esc(l.country)}</p>
              </div>
            </div>
            <p class="text-slate-300 leading-relaxed mb-6">${esc(l.description)}</p>
          </div>
          <div class="flex flex-col md:flex-row gap-3">
            <button class="flex-1 self-start md:self-center px-6 py-3 bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors font-semibold flex items-center justify-center gap-2">
              <i class="fas fa-info-circle"></i> View Full Details
            </button>
            <div class="icons self-end md:self-center">
              <button class="px-4 py-3 bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors"><i class="far fa-heart"></i></button>
              <button class="px-4 py-3 bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors"><i class="fas fa-bell"></i></button>
            </div>
          </div>
        </div>
        <div class="relative">
          <div class="relative h-full min-h-[400px] rounded-2xl overflow-hidden bg-slate-900/50">
            ${media}
            <div class="absolute inset-0 bg-linear-to-t from-slate-900 via-transparent to-transparent"></div>
          </div>
        </div>
      </div>
    </div>`;
}

function cardHTML(l) {
    const dt = launchDateTime(l.net);
    const media = l.image
        ? `<img class="w-full h-full object-cover" src="${esc(l.image)}" alt="${esc(l.name)}" loading="lazy" />`
        : `<i class="fas fa-rocket text-5xl text-slate-700"></i>`;

    return `
    <div class="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-all group cursor-pointer">
      <div class="relative h-48 bg-slate-900/50 flex items-center justify-center overflow-hidden">
        ${media}
        <div class="absolute top-3 right-3">${statusBadge(l.status)}</div>
      </div>
      <div class="p-5">
        <div class="mb-3">
          <h4 class="font-bold text-lg mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">${esc(l.name)}</h4>
          <p class="text-sm text-slate-400 flex items-center gap-2"><i class="fas fa-building text-xs"></i> ${esc(l.provider)}</p>
        </div>
        <div class="space-y-2 mb-4">
          <div class="flex items-center gap-2 text-sm"><i class="fas fa-calendar text-slate-500 w-4"></i><span class="text-slate-300">${esc(dt.date)}</span></div>
          <div class="flex items-center gap-2 text-sm"><i class="fas fa-clock text-slate-500 w-4"></i><span class="text-slate-300">${esc(dt.time)}</span></div>
          <div class="flex items-center gap-2 text-sm"><i class="fas fa-rocket text-slate-500 w-4"></i><span class="text-slate-300">${esc(l.rocket)}</span></div>
          <div class="flex items-center gap-2 text-sm"><i class="fas fa-map-marker-alt text-slate-500 w-4"></i><span class="text-slate-300 line-clamp-1">${esc(l.pad)}</span></div>
        </div>
        <div class="flex items-center gap-2 pt-4 border-t border-slate-700">
          <button class="flex-1 px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm font-semibold">Details</button>
          <button class="px-3 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"><i class="far fa-heart"></i></button>
        </div>
      </div>
    </div>`;
}

const stateBox = (html) =>
    `<div class="text-center text-slate-400 py-10" style="grid-column:1/-1">${html}</div>`;

let launchesState = 'idle'; // idle | loading | done

async function loadLaunches() {
    if (launchesState === 'loading' || launchesState === 'done') return;
    launchesState = 'loading';

    featuredBox.innerHTML = stateBox('<i class="fas fa-spinner fa-spin text-3xl text-blue-400 mb-3"></i><p>Loading launches...</p>');
    launchesGrid.innerHTML = '';

    try {
        const data = await getJSON(CONFIG.LAUNCHES_URL, 10 * 60 * 1000);
        const launches = (data.results || []).map(normalizeLaunch);

        if (!launches.length) {
            featuredBox.innerHTML = stateBox('No upcoming launches found.');
            launchesState = 'idle';
            return;
        }

        featuredBox.innerHTML = featuredHTML(launches[0]);
        launchesGrid.innerHTML = launches.slice(1).map(cardHTML).join('');

        countDesktop.textContent = `${launches.length} Launches`;
        countMobile.textContent = String(launches.length);
        launchesState = 'done';
    } catch (err) {
        featuredBox.innerHTML = stateBox(
            `<i class="fas fa-triangle-exclamation text-3xl text-yellow-400 mb-3"></i><p>${esc(errorMessage(err))}</p>
       <button id="retry-launches" class="mt-4 px-4 py-2 bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors font-semibold text-sm">Try again</button>`
        );
        $('#retry-launches')?.addEventListener('click', () => {
            launchesState = 'idle';
            loadLaunches();
        });
        launchesState = 'idle';
    }
}
const initLaunches = loadLaunches;

/* =====================================================
   3) Planets (Solar System OpenData)
   ===================================================== */
const PLANET_INFO = {
    mercury: {
        description:
            'Mercury is the smallest planet in the Solar System and the closest to the Sun. It has almost no atmosphere, so its surface swings between scorching days and freezing nights.',
        facts: [
            'A year on Mercury lasts only 88 Earth days',
            'Its surface is covered with craters, like the Moon',
            'It has no moons and no rings',
            'Temperatures range from -180°C to 430°C',
        ],
    },
    venus: {
        description:
            'Venus is the hottest planet in the Solar System thanks to a thick carbon dioxide atmosphere that traps heat. It spins backwards compared to most planets.',
        facts: [
            'A day on Venus is longer than its year',
            'It rotates in the opposite direction to Earth',
            'Surface pressure is about 90 times that of Earth',
            'It is the brightest planet in our night sky',
        ],
    },
    earth: {
        description:
            "Earth is the third planet from the Sun and the only astronomical object known to harbor life. About 71% of its surface is covered with water, mostly oceans.",
        facts: [
            'Only known planet with liquid water on its surface',
            'Atmosphere contains about 78% nitrogen',
            'Magnetic field protects it from the solar wind',
            'Formed about 4.54 billion years ago',
        ],
    },
    mars: {
        description:
            'Mars is a cold desert world with a thin atmosphere. Its red color comes from iron oxide, and it is home to Olympus Mons, the tallest volcano in the Solar System.',
        facts: [
            'Home to Olympus Mons, the tallest volcano known',
            'Has two small moons: Phobos and Deimos',
            'A day on Mars is about 24.6 hours',
            'Evidence suggests liquid water once flowed there',
        ],
    },
    jupiter: {
        description:
            'Jupiter is the largest planet in the Solar System, a gas giant with a mass more than twice that of all the other planets combined. Its Great Red Spot is a storm larger than Earth.',
        facts: [
            'The Great Red Spot is a storm bigger than Earth',
            'It has the shortest day of all planets (about 10 hours)',
            'Its strong magnetic field is the largest of any planet',
            'It has dozens of known moons, including Ganymede',
        ],
    },
    saturn: {
        description:
            'Saturn is a gas giant famous for its spectacular ring system made mostly of ice and rock. It is the least dense planet, less dense than water.',
        facts: [
            'Its rings are made mostly of ice particles',
            'It is less dense than water',
            'Its largest moon, Titan, has a thick atmosphere',
            'Winds can reach about 1,800 km/h',
        ],
    },
    uranus: {
        description:
            'Uranus is an ice giant that rotates on its side, with an axial tilt of about 98 degrees. Methane in its atmosphere gives it a pale cyan color.',
        facts: [
            'It rotates on its side',
            'It is the coldest planet in the Solar System',
            'It has 13 known rings',
            'Discovered in 1781 by William Herschel',
        ],
    },
    neptune: {
        description:
            'Neptune is the most distant planet from the Sun, a dark, cold ice giant with supersonic winds. It was found through mathematical predictions before it was seen.',
        facts: [
            'It has the fastest winds in the Solar System',
            'It was found by calculation before observation',
            'One year on Neptune lasts about 165 Earth years',
            'Its largest moon, Triton, orbits backwards',
        ],
    },
};

const planetEls = {
    image: $('#planet-detail-image'),
    name: $('#planet-detail-name'),
    description: $('#planet-detail-description'),
    distance: $('#planet-distance'),
    radius: $('#planet-radius'),
    mass: $('#planet-mass'),
    density: $('#planet-density'),
    orbital: $('#planet-orbital-period'),
    rotation: $('#planet-rotation'),
    moons: $('#planet-moons'),
    gravity: $('#planet-gravity'),
    discoverer: $('#planet-discoverer'),
    discoveryDate: $('#planet-discovery-date'),
    bodyType: $('#planet-body-type'),
    volume: $('#planet-volume'),
    facts: $('#planet-facts'),
    perihelion: $('#planet-perihelion'),
    aphelion: $('#planet-aphelion'),
    eccentricity: $('#planet-eccentricity'),
    inclination: $('#planet-inclination'),
    axialTilt: $('#planet-axial-tilt'),
    temp: $('#planet-temp'),
    escape: $('#planet-escape'),
};

const NA = 'N/A';
const has = (v) => v !== undefined && v !== null && v !== '';

const millionKm = (v) => (has(v) ? `${fmt(v / 1e6, 1)}M km` : NA);

function rotationText(hours) {
    if (!has(hours)) return NA;
    const h = Math.abs(hours);
    const retro = hours < 0 ? ' (retrograde)' : '';
    return h >= 48 ? `${fmt(h / 24, 1)} days${retro}` : `${fmt(h, 1)} hours${retro}`;
}

function orbitText(days) {
    if (!has(days)) return NA;
    return days >= 1000 ? `${fmt(days / 365.25, 1)} years` : `${fmt(days, 2)} days`;
}

function renderPlanet(id, p) {
    const info = PLANET_INFO[id] || { description: '', facts: [] };
    const E = planetEls;

    E.image.src = `./assets/images/${id}.png`;
    E.image.alt = `${p.englishName || id} planet`;
    E.name.textContent = p.englishName || id;
    E.description.textContent = info.description;

    E.distance.textContent = millionKm(p.semimajorAxis);
    E.radius.textContent = has(p.meanRadius) ? `${fmt(p.meanRadius, 1)} km` : NA;
    E.mass.textContent = p.mass ? `${p.mass.massValue.toFixed(2)} × 10${sup(p.mass.massExponent)} kg` : NA;
    E.density.textContent = has(p.density) ? `${fmt(p.density, 2)} g/cm³` : NA;
    E.orbital.textContent = orbitText(p.sideralOrbit);
    E.rotation.textContent = rotationText(p.sideralRotation);
    E.moons.textContent = Array.isArray(p.moons) ? p.moons.length : 0;
    E.gravity.textContent = has(p.gravity) ? `${fmt(p.gravity, 1)} m/s²` : NA;

    E.discoverer.textContent = p.discoveredBy || 'Known since antiquity';
    E.discoveryDate.textContent = p.discoveryDate || 'Ancient';
    E.bodyType.textContent = p.bodyType || 'Planet';
    E.volume.textContent = p.vol ? `${p.vol.volValue.toFixed(2)} × 10${sup(p.vol.volExponent)} km³` : NA;

    E.perihelion.textContent = millionKm(p.perihelion);
    E.aphelion.textContent = millionKm(p.aphelion);
    E.eccentricity.textContent = has(p.eccentricity) ? fmt(p.eccentricity, 4) : NA;
    E.inclination.textContent = has(p.inclination) ? `${fmt(p.inclination, 2)}°` : NA;
    E.axialTilt.textContent = has(p.axialTilt) ? `${fmt(p.axialTilt, 2)}°` : NA;
    E.temp.textContent = has(p.avgTemp) ? `${fmt(p.avgTemp - 273.15)}°C` : NA;
    E.escape.textContent = has(p.escape) ? `${fmt(p.escape / 1000, 1)} km/s` : NA;

    E.facts.innerHTML = info.facts
        .map(
            (f) => `
      <li class="flex items-start">
        <i class="fas fa-check text-green-400 mt-1 mr-2"></i>
        <span class="text-slate-300">${esc(f)}</span>
      </li>`
        )
        .join('');
}

const planetCards = $$('.planet-card');
let planetRequestId = 0;
let allPlanetsPromise = null;

// The proxy returns every planet in one response, so we fetch it once
function loadAllPlanets() {
    if (!allPlanetsPromise) {
        allPlanetsPromise = getJSON(CONFIG.PLANETS_URL, 60 * 60 * 1000)
            .then((data) =>
                Array.isArray(data) ? data : data.bodies || data.planets || data.data || []
            )
            .catch((err) => {
                allPlanetsPromise = null; // allow retry
                throw err;
            });
    }
    return allPlanetsPromise;
}

// Some versions of this API use French ids (terre, mercure, saturne...)
const PLANET_ALIASES = {
    mercury: ['mercure'],
    earth: ['terre'],
    saturn: ['saturne'],
    uranus: ['uranus'],
    neptune: ['neptune'],
};

function findPlanet(list, id) {
    const wanted = [id, ...(PLANET_ALIASES[id] || [])];
    return list.find((p) =>
        [p.id, p.englishName, p.name]
            .filter(Boolean)
            .some((n) => wanted.includes(String(n).toLowerCase()))
    );
}
let planetsReady = false;

function markPlanetCard(id) {
    planetCards.forEach((card) => {
        const on = card.dataset.planetId === id;
        const color = card.style.getPropertyValue('--planet-color').trim() || '#3b82f6';
        card.style.boxShadow = on ? `0 0 0 2px ${color}` : '';
        card.style.borderColor = on ? `${color}80` : '';
    });
}

async function selectPlanet(id) {
    const reqId = ++planetRequestId;
    markPlanetCard(id);
    planetEls.name.textContent = 'Loading...';

    try {
        const list = await loadAllPlanets();
        const data = findPlanet(list, id);
        if (!data) {
            const notFound = new Error('Planet not found');
            notFound.status = 404;
            throw notFound;
        }
        if (reqId !== planetRequestId) return;
        renderPlanet(id, data);
    } catch (err) {
        if (reqId !== planetRequestId) return;
        planetEls.name.textContent = id.charAt(0).toUpperCase() + id.slice(1);
        planetEls.description.textContent = errorMessage(err);
    }
}

planetCards.forEach((card) =>
    card.addEventListener('click', () => selectPlanet(card.dataset.planetId))
);

function initPlanets() {
    if (planetsReady) return;
    planetsReady = true;
    selectPlanet('earth');
}

/* =====================================================
   Start
   ===================================================== */
showSection('today-in-space');
loadApod();
loadLaunches(); // preload so the header counter is right