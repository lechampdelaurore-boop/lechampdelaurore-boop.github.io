// Vérifie le site EN LIGNE, au format téléphone, comme le ferait Chrome sur Android :
//  1. la page d'accueil s'affiche sans défiler de côté, liste les applis (via l'API GitHub),
//     et la fenêtre de profil (prénom + compagnon) marche à la première ouverture ;
//  2. l'accueil et chaque appli listée sont installables (manifeste, icônes, service worker),
//     sans erreur dans la console, et se rouvrent hors ligne.
// Usage : node tests/en-ligne.cjs [url]   (captures dans captures/)
// Variables : MIN_APPS (2 par défaut), MOCK_API=fichier.json pour remplacer l'API GitHub en local.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = (process.argv[2] || 'https://lechampdelaurore-boop.github.io/').replace(/\/?$/, '/');
const LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const MIN_APPS = Number(process.env.MIN_APPS || 2);
const SIZES = [[320, 568], [360, 640], [390, 844], [412, 915], [768, 1024]];
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: LOCAL };

const lines = [];
let failed = false;
const ok = (good, text) => { if (!good) failed = true; lines.push((good ? '✅ ' : '❌ ') + text); return good; };

async function newContext(browser, opts) {
  const ctx = await browser.newContext(opts);
  if (process.env.MOCK_API) {
    const body = fs.readFileSync(process.env.MOCK_API, 'utf8');
    await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body }));
  }
  return ctx;
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // L'accueil sonde la page de chaque dépôt publié : un dépôt sans site (404) n'est pas une erreur.
    if (/^Failed to load resource/.test(m.text()) && /^https?:\/\/[^/]+\/[^/]+\/(\?.*)?$/.test(m.location().url || '')) return;
    errors.push(m.text());
  });
  return errors;
}

async function waitForLiveVersion() {
  if (LOCAL || !fs.existsSync('sw.js')) return;
  const expected = (fs.readFileSync('sw.js', 'utf8').match(/var CACHE = '([^']+)'/) || [])[1];
  for (let i = 0; ; i++) {
    const live = await fetch(BASE + 'sw.js?nocache=' + Date.now()).then(r => r.text()).catch(() => '');
    if (live.includes(expected)) { console.log('Version en ligne : ' + expected); return; }
    if (i >= 18) { ok(false, `Le site en ligne n'a pas la version ${expected} après 3 min`); return; }
    await new Promise(r => setTimeout(r, 10000));
  }
}

async function checkHome(browser) {
  lines.push('', '### Page d’accueil');
  let apps = [];
  for (const [w, h] of SIZES) {
    const ctx = await newContext(browser, { ...PHONE, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(BASE + '?nocache=' + Date.now());
    const loaded = await page.waitForFunction(() => document.getElementById('status').textContent === 'Liste à jour', null, { timeout: 30000 }).then(() => true, () => false);
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => ({
      side: document.documentElement.scrollWidth - window.innerWidth,
      themes: document.querySelectorAll('.theme-btn').length,
      fermes: [...document.querySelectorAll('.theme-btn')].every(b => b.getAttribute('aria-expanded') === 'false') &&
        ![...document.querySelectorAll('a.app')].some(a => a.offsetParent),
      apps: [...document.querySelectorAll('a.app')].map(a => ({
        href: a.href,
        name: a.querySelector('.app-name').textContent,
        icon: !!(a.querySelector('img.app-icon') && a.querySelector('img.app-icon').naturalWidth > 0)
      }))
    }));
    await page.screenshot({ path: `captures/accueil-${w}x${h}.png`, fullPage: true });
    // Première ouverture : la fenêtre de profil demande le prénom, puis le compagnon.
    let profil = false;
    if (await page.evaluate(() => document.getElementById('profil').open)) {
      await page.fill('#prenomInput', 'test');
      await page.click('#profilOk');
      await page.click('.avatar[data-nom="Braisou"]');
      await page.screenshot({ path: `captures/profil-${w}x${h}.png` });
      await page.click('#profilOk');
      profil = await page.evaluate(() => !document.getElementById('profil').open &&
        /Coucou Test/.test(document.querySelector('h1').textContent) &&
        /Braisou/.test(document.getElementById('mascotte').getAttribute('aria-label')));
    }
    // Thèmes : fermés au départ, un toucher en ouvre un (et un seul).
    await page.click('.theme-btn');
    await page.waitForTimeout(600);
    const ouvre = await page.evaluate(() => {
      const b = document.querySelectorAll('.theme-btn[aria-expanded="true"]');
      return b.length === 1 && [...document.getElementById(b[0].getAttribute('aria-controls')).querySelectorAll('a.app')].every(a => a.offsetParent) &&
        document.documentElement.scrollWidth - window.innerWidth <= 0;
    });
    await page.screenshot({ path: `captures/theme-ouvert-${w}x${h}.png`, fullPage: true });
    const themesOk = info.themes >= 3 && info.fermes && ouvre;
    const badIcons = info.apps.filter(a => !a.icon).map(a => a.name);
    ok(loaded && profil && themesOk && info.apps.length >= MIN_APPS && info.side <= 0 && !badIcons.length && !errors.length,
      `${w}×${h} : ${loaded ? 'liste à jour depuis GitHub' : 'liste NON mise à jour depuis GitHub'}, ${info.apps.length} applis` +
      (profil ? ', profil OK' : ', fenêtre de profil en panne') +
      (themesOk ? `, ${info.themes} thèmes fermés au départ, ouverture OK` : `, thèmes en panne (${info.themes} thèmes, fermés : ${info.fermes}, ouverture : ${ouvre})`) +
      (info.side > 0 ? `, déborde de ${info.side} px sur le côté` : '') +
      (badIcons.length ? `, icône manquante : ${badIcons.join(', ')}` : '') +
      (errors.length ? `, erreurs console : ${errors.join(' | ')}` : ''));
    apps = info.apps;
    await ctx.close();
  }
  return apps;
}

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20);
}

async function checkInstallable(browser, url, label) {
  const ctx = await newContext(browser, PHONE);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const problems = [];
  const res = await page.goto(url + '?nocache=' + Date.now());
  if (!res || !res.ok()) { ok(false, `${label} : la page ne répond pas (${res && res.status()})`); await ctx.close(); return; }
  await page.waitForLoadState('load');

  // Service worker : enregistré, puis aux commandes après un rechargement.
  const sw = await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(r => r.scope),
    new Promise(r => setTimeout(() => r(null), 20000))
  ]));
  if (!sw) problems.push('pas de service worker');
  await page.reload();
  await page.waitForLoadState('load');
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (sw && !controlled) problems.push('le service worker ne contrôle pas la page');

  // Manifeste, tel que Chrome le lit.
  const cdp = await ctx.newCDPSession(page);
  const am = await cdp.send('Page.getAppManifest');
  let m = null;
  try { m = JSON.parse(am.data); } catch (e) { problems.push('manifeste introuvable ou illisible'); }
  (am.errors || []).forEach(e => problems.push('manifeste : ' + e.message));
  if (m) {
    const murl = am.url;
    if (!m.name || !m.short_name) problems.push('nom ou nom court manquant');
    if (!['standalone', 'fullscreen'].includes(m.display)) problems.push('display n’est pas standalone');
    const start = new URL(m.start_url || '.', murl).href;
    const scope = new URL(m.scope || '.', murl).href;
    if (!start.startsWith(scope)) problems.push('start_url hors du scope');
    if (!url.startsWith(scope)) problems.push(`la page n’est pas dans le scope (${scope})`);
    if (sw && sw !== scope && !scope.startsWith(sw)) problems.push(`scope du service worker (${sw}) différent du manifeste (${scope})`);
    const sizes = new Set();
    let maskable = false;
    for (const ic of m.icons || []) {
      const iurl = new URL(ic.src, murl).href;
      const r = await page.request.get(iurl);
      if (!r.ok()) { problems.push('icône introuvable : ' + ic.src); continue; }
      if (/png/.test(ic.type || iurl)) {
        const real = pngSize(await r.body());
        if (ic.sizes && real && ic.sizes !== real) problems.push(`${ic.src} annoncée ${ic.sizes} mais mesure ${real}`);
        if (real && /any|^$/.test(ic.purpose || '')) sizes.add(real);
        if (/maskable/.test(ic.purpose || '')) maskable = true;
      }
    }
    if (!sizes.has('192x192') || !sizes.has('512x512')) problems.push('il faut des icônes PNG 192×192 et 512×512');
    if (!maskable) problems.push('pas d’icône « maskable » (Android)');
  }
  const appleIcon = await page.evaluate(() => { const l = document.querySelector('link[rel="apple-touch-icon"]'); return l && l.href; });
  if (!appleIcon || !(await page.request.get(appleIcon)).ok()) problems.push('pas d’icône pour iPhone (apple-touch-icon)');

  // L'avis de Chrome lui-même.
  const inst = await cdp.send('Page.getInstallabilityErrors').catch(() => ({ installabilityErrors: [] }));
  (inst.installabilityErrors || []).forEach(e => problems.push('Chrome : ' + e.errorId));
  if (errors.length) problems.push('erreurs console : ' + errors.join(' | '));

  // Hors ligne : la page doit se rouvrir.
  await page.screenshot({ path: `captures/${label}.png` });
  await ctx.setOffline(true);
  const offline = await page.reload().then(() => page.evaluate(() => document.body.innerText.trim().length), () => 0);
  await ctx.setOffline(false);
  if (offline < 20) problems.push('ne s’ouvre pas hors ligne');

  ok(!problems.length, `${label} : ${problems.length ? problems.join(' ; ') : 'installable, service worker actif, marche hors ligne'}`);
  await ctx.close();
}

(async () => {
  fs.mkdirSync('captures', { recursive: true });
  await waitForLiveVersion();
  const browser = await chromium.launch({ args: LOCAL ? ['--ignore-certificate-errors'] : [] });
  const apps = await checkHome(browser);
  lines.push('', '### Installation sur téléphone');
  await checkInstallable(browser, BASE, 'accueil');
  for (const a of apps) await checkInstallable(browser, a.href, a.href.replace(/\/$/, '').split('/').pop());
  await browser.close();
  const report = lines.join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Test du site en ligne\n' + report + '\n');
  process.exit(failed ? 1 : 0);
})();
