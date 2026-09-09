/**
 * fetch-rscripts.js
 * Puxa scripts do rscripts (API pública, sem chave).
 * Por padrão puxa 1 script keyless / free / não Asus Studio.
 * Salva em pending-scripts.json para revisão no painel.
 *
 * Uso:
 *   node fetch-rscripts.js
 *   node fetch-rscripts.js --limit=1
 *   node fetch-rscripts.js --limit=5 --game="Steal an egg"
 */

const fs = require("fs");
const path = require("path");

const PENDING_FILE = path.join(__dirname, "pending-scripts.json");
const PUBLISHED_FILE = path.join(__dirname, "scripts-data.json");
const EXCLUDE_AUTHORS = ["asus studio", "asus studios", "asusstudio"];

function arg(name, def) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : def;
}

const LIMIT = parseInt(arg("limit", "1"), 10) || 1;
const GAME_FILTER = (arg("game", "") || "").toLowerCase();

async function fetchPage(page = 1) {
  // free + prefer no key system; order by date (mais recentes)
  const url =
    `https://rscripts.net/api/v2/scripts?page=${page}` +
    `&orderBy=date&sort=desc&notPaid=true`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 AresScriptsBot/1.0" }
  });
  if (!res.ok) throw new Error(`rscripts HTTP ${res.status}`);
  return res.json();
}

function isExcludedAuthor(username) {
  const u = (username || "").toLowerCase();
  return EXCLUDE_AUTHORS.some(x => u.includes(x));
}

function alreadyKnown(rawUrl, published, pending) {
  const all = [...published, ...pending];
  return all.some(
    s =>
      s.loadstringOriginal === rawUrl ||
      s.rawScript === rawUrl ||
      (s.rscriptsId && s.rscriptsId === rawUrl)
  );
}

function mapScript(s) {
  const game = s.game || {};
  const user = s.user || {};
  const placeId = game.placeId ? String(game.placeId) : "";
  const jogo = game.title || s.title || "Unknown";
  const hub = user.username ? `@${user.username}` : "@Unknown";
  const raw = s.rawScript || "";
  const keyless = s.keySystem === false;

  return {
    rscriptsId: s._id,
    slug: s.slug,
    title: s.title,
    jogo,
    place_id: placeId,
    hub,
    creditos: user.username || "Unknown",
    loadstringOriginal: raw,
    rawScript: raw,
    keyless,
    compatible: s.mobileReady ? ["Delta", "Mobile"] : ["Delta"],
    descricao: keyless
      ? "Keyless • Compatible with Delta"
      : "Key System • Compatible with Delta",
    description: (s.description || "").slice(0, 300),
    thumbnail: game.imgurl || game.gameLogo || null,
    mobileReady: !!s.mobileReady,
    paid: !!s.paid,
    likes: s.likes || 0,
    views: s.views || 0,
    source: "rscripts",
    fetchedAt: new Date().toISOString(),
    status: "pending"
  };
}

async function main() {
  let published = [];
  let pending = [];
  if (fs.existsSync(PUBLISHED_FILE)) {
    try {
      published = JSON.parse(fs.readFileSync(PUBLISHED_FILE, "utf-8"));
    } catch {}
  }
  if (fs.existsSync(PENDING_FILE)) {
    try {
      pending = JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8"));
    } catch {}
  }

  console.log(`\n🔎 Buscando no rscripts (limite: ${LIMIT})...\n`);

  const found = [];
  let page = 1;
  const maxPages = 5;

  while (found.length < LIMIT && page <= maxPages) {
    const data = await fetchPage(page);
    const scripts = data.scripts || [];
    if (!scripts.length) break;

    for (const s of scripts) {
      if (found.length >= LIMIT) break;

      const user = s.user || {};
      if (isExcludedAuthor(user.username)) {
        console.log(`  ✗ skip autor: ${user.username}`);
        continue;
      }
      if (s.paid) continue;
      // prefer keyless for auto, but allow key if needed
      // for first test: prefer keyless
      if (s.keySystem === true) {
        continue;
      }
      if (!s.rawScript) continue;

      const gameTitle = ((s.game && s.game.title) || "").toLowerCase();
      if (GAME_FILTER && !gameTitle.includes(GAME_FILTER) && !(s.title || "").toLowerCase().includes(GAME_FILTER)) {
        continue;
      }

      if (alreadyKnown(s.rawScript, published, pending)) {
        console.log(`  ✗ já conhecido: ${s.title}`);
        continue;
      }

      // também evita duplicar por id
      if (
        published.some(p => p.rscriptsId === s._id) ||
        pending.some(p => p.rscriptsId === s._id)
      ) {
        continue;
      }

      const mapped = mapScript(s);
      found.push(mapped);
      console.log(`  ✓ ${mapped.jogo} | ${mapped.hub} | ${mapped.title}`);
    }

    page++;
    await new Promise(r => setTimeout(r, 400));
  }

  if (!found.length) {
    console.log("\n⚠ Nenhum script novo encontrado com os filtros atuais.");
    process.exit(0);
  }

  pending = [...found, ...pending];
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2), "utf-8");

  console.log(`\n✅ ${found.length} script(s) adicionados em pending-scripts.json`);
  console.log(`   Total na fila: ${pending.length}`);
}

main().catch(err => {
  console.error("Erro:", err.message);
  process.exit(1);
});
