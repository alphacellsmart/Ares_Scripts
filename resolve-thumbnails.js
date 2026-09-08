/**
 * resolve-thumbnails.js
 * Busca as thumbnails oficiais dos jogos no Roblox
 * usando o place_id de cada script no scripts-data.json
 *
 * Uso:
 *   node resolve-thumbnails.js
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "scripts-data.json");

async function fetchThumbnail(placeId) {
  // API oficial de thumbnails do Roblox (game icons)
  const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const item = data?.data?.[0];

  if (item && item.imageUrl && item.state === "Completed") {
    return item.imageUrl;
  }

  // Fallback: thumbnail genérica de place
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${placeId}&width=420&height=420&format=png`;
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error("❌ scripts-data.json não encontrado");
    process.exit(1);
  }

  const scripts = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  // Agrupa por place_id pra não buscar a mesma thumbnail várias vezes
  const placeIds = [...new Set(scripts.map(s => String(s.place_id)).filter(Boolean))];
  const thumbCache = {};

  console.log(`\n🖼️  Resolvendo thumbnails de ${placeIds.length} jogos...\n`);

  for (const placeId of placeIds) {
    try {
      const thumb = await fetchThumbnail(placeId);
      thumbCache[placeId] = thumb;
      console.log(`  ✓ ${placeId} → ${thumb.slice(0, 60)}...`);
    } catch (err) {
      console.log(`  ✗ ${placeId}: ${err.message}`);
      thumbCache[placeId] = null;
    }
    // Pequena pausa pra não estressar a API
    await new Promise(r => setTimeout(r, 300));
  }

  // Aplica em todos os scripts
  let updated = 0;
  for (const script of scripts) {
    const pid = String(script.place_id);
    if (thumbCache[pid]) {
      script.thumbnail = thumbCache[pid];
      updated++;
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(scripts, null, 2), "utf-8");

  console.log(`\n✅ Thumbnails atualizadas em ${updated} scripts.`);
  console.log(`   Jogos únicos: ${placeIds.length}`);
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
