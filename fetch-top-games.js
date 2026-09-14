/**
 * fetch-top-games.js
 * 1) Busca os jogos mais jogados (Rolimons API)
 * 2) Para cada um dos TOP N, procura 1 script no rscripts (prefer keyless)
 * 3) Adiciona em pending-scripts.json pra revisão no admin
 *
 * Uso:
 *   node fetch-top-games.js
 *   node fetch-top-games.js --limit=20
 *   node fetch-top-games.js --per-game=1
 */

const fs = require("fs");
const path = require("path");

const PENDING_FILE = path.join(__dirname, "pending-scripts.json");
const PUBLISHED_FILE = path.join(__dirname, "scripts-data.json");
const EXCLUDE_AUTHORS = ["asus studio", "asus studios", "asusstudio"];

function arg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : def;
}

const TOP_LIMIT = parseInt(arg("limit", "20"), 10) || 20;
const PER_GAME = parseInt(arg("per-game", "1"), 10) || 1;

// Fallback se Rolimons estiver bloqueado (jogos grandes conhecidos)
const FALLBACK_TOP = [
  { placeId: "109983668079237", name: "Steal an Egg" }, // pode mudar com updates
  { placeId: "2753915549", name: "Blox Fruits" },
  { placeId: "142823291", name: "Murder Mystery 2" },
  { placeId: "4924922222", name: "Brookhaven" },
  { placeId: "8737899170", name: "Pet Simulator 99" },
  { placeId: "17625359962", name: "Rivals" },
  { placeId: "116495829188952", name: "Grow a Garden" },
  { placeId: "18668065416", name: "Fisch" },
  { placeId: "13772394625", name: "Blade Ball" },
  { placeId: "286090429", name: "Arsenal" },
  { placeId: "606849621", name: "Jailbreak" },
  { placeId: "920587237", name: "Adopt Me" },
  { placeId: "15532962292", name: "Babft" },
  { placeId: "77747658251236", name: "Sailor Piece" },
  { placeId: "10450270085", name: "Jujutsu Infinite" },
  { placeId: "6516141723", name: "Doors" },
  { placeId: "18901177230", name: "Dead Rails" },
  { placeId: "11630038968", name: "The Strongest Battlegrounds" },
  { placeId: "3956818381", name: "Ninja Legends" },
  { placeId: "994732206", name: "Bloxburg" },
];

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function getTopGamesFromRolimons(limit) {
  const data = await fetchJson("https://api.rolimons.com/games/v1/gamelist");
  if (!data.success || !data.games) throw new Error("Rolimons sem games");
  const items = [];
  for (const [placeId, arr] of Object.entries(data.games)) {
    if (!Array.isArray(arr) || arr.length < 2) continue;
    const name = arr[0];
    const players = Number(arr[1]) || 0;
    const icon = arr[2] || null;
    items.push({ placeId: String(placeId), name, players, icon });
  }
  items.sort((a, b) => b.players - a.players);
  return items.slice(0, limit);
}

async function searchRscripts(query) {
  const url =
    `https://rscripts.net/api/v2/scripts?page=1&orderBy=likes&sort=desc` +
    `&notPaid=true&q=${encodeURIComponent(query)}`;
  try {
    const data = await fetchJson(url);
    return data.scripts || [];
  } catch {
    return [];
  }
}

function isExcludedAuthor(username) {
  const u = (username || "").toLowerCase();
  return EXCLUDE_AUTHORS.some((x) => u.includes(x));
}

function alreadyKnown(rawUrl, published, pending) {
  const all = [...published, ...pending];
  return all.some(
    (s) =>
      s.loadstringOriginal === rawUrl ||
      s.rawScript === rawUrl ||
      (s.rscriptsId && rawUrl && s.rscriptsId === rawUrl)
  );
}

function mapScript(s, jogoForce, placeForce) {
  const game = s.game || {};
  const user = s.user || {};
  const placeId = placeForce || (game.placeId ? String(game.placeId) : "");
  const jogo = jogoForce || game.title || s.title || "Unknown";
  const hubName = user.username || "Unknown";
  const raw = s.rawScript || "";
  let keyless = s.keySystem === false;
  const title = (s.title || "").toLowerCase();
  if (title.includes("keyless") || title.includes("no key")) keyless = true;

  return {
    rscriptsId: s._id,
    slug: s.slug,
    title: s.title,
    jogo,
    place_id: placeId,
    hub: "@" + hubName,
    creditos: hubName,
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
    source: "rscripts-top-games",
    fetchedAt: new Date().toISOString(),
    status: "pending",
  };
}

function scoreScript(s, placeId, gameName) {
  let score = 0;
  if (s.keySystem === false) score += 50;
  const title = (s.title || "").toLowerCase();
  if (title.includes("keyless") || title.includes("no key")) score += 20;
  if (!s.paid) score += 10;
  score += Math.min(30, s.likes || 0);
  const g = s.game || {};
  if (placeId && String(g.placeId) === String(placeId)) score += 40;
  const gt = (g.title || "").toLowerCase();
  const gn = (gameName || "").toLowerCase();
  if (gn && (gt.includes(gn.slice(0, 12)) || title.includes(gn.slice(0, 12))))
    score += 25;
  if (!s.rawScript) score -= 100;
  const author = ((s.user || {}).username || "").toLowerCase();
  if (isExcludedAuthor(author)) score -= 1000;
  return score;
}

async function pickScriptsForGame(game, published, pending, perGame) {
  const queries = [];
  if (game.name) queries.push(game.name);
  // nome limpo sem emojis/tags
  const clean = (game.name || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean && clean !== game.name) queries.push(clean);
  if (game.placeId) queries.push(String(game.placeId));

  let candidates = [];
  const seenIds = new Set();
  for (const q of queries) {
    const list = await searchRscripts(q);
    for (const s of list) {
      if (!s._id || seenIds.has(s._id)) continue;
      seenIds.add(s._id);
      candidates.push(s);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  candidates = candidates
    .map((s) => ({ s, score: scoreScript(s, game.placeId, clean || game.name) }))
    .filter((x) => x.score > 0 && x.s.rawScript && !x.s.paid)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  for (const { s } of candidates) {
    if (picked.length >= perGame) break;
    if (alreadyKnown(s.rawScript, published, [...pending, ...picked])) continue;
    if (
      published.some((p) => p.rscriptsId === s._id) ||
      pending.some((p) => p.rscriptsId === s._id)
    )
      continue;
    picked.push(mapScript(s, clean || game.name, game.placeId));
  }
  return picked;
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
  if (!Array.isArray(published)) published = [];
  if (!Array.isArray(pending)) pending = [];

  console.log(`\n🔥 Top ${TOP_LIMIT} jogos → rscripts (${PER_GAME}/jogo)\n`);

  let topGames;
  try {
    topGames = await getTopGamesFromRolimons(TOP_LIMIT);
    console.log(`✓ Rolimons: ${topGames.length} jogos\n`);
    topGames.forEach((g, i) =>
      console.log(
        `  ${String(i + 1).padStart(2)}. ${String(g.players).padStart(9)} online | ${g.name}`
      )
    );
  } catch (e) {
    console.warn(`⚠ Rolimons falhou (${e.message}). Usando lista fallback.`);
    topGames = FALLBACK_TOP.slice(0, TOP_LIMIT).map((g) => ({
      ...g,
      players: 0,
      icon: null,
    }));
  }

  console.log("\n🔎 Buscando scripts...\n");
  const found = [];

  for (const game of topGames) {
    process.stdout.write(`  → ${game.name}... `);
    try {
      const picks = await pickScriptsForGame(
        game,
        published,
        [...pending, ...found],
        PER_GAME
      );
      if (!picks.length) {
        console.log("nenhum novo");
        continue;
      }
      for (const p of picks) {
        found.push(p);
        console.log(
          `${p.hub} ${p.keyless ? "Keyless" : "Key"} (${p.likes} likes)`
        );
      }
    } catch (e) {
      console.log("erro:", e.message);
    }
  }

  if (!found.length) {
    console.log("\n⚠ Nenhum script novo encontrado.");
    process.exit(0);
  }

  pending = [...found, ...pending];
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2), "utf-8");
  console.log(
    `\n✅ ${found.length} script(s) na fila pending-scripts.json (total: ${pending.length})`
  );
  console.log("   Revise no admin → Aprovar / Recusar\n");
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
