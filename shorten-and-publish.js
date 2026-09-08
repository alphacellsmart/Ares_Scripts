/**
 * shorten-and-publish.js
 *
 * Fluxo simples (igual ao manual no Pastefy):
 * 1. Cria UMA paste no Pastefy com conteúdo:
 *      loadstring(game:HttpGet("URL_ORIGINAL"))()
 * 2. Encurta o /raw dessa paste no Shrtfly
 * 3. Salva linkShrtfly + loadstringFinal no JSON
 *
 * GET SCRIPT → Shrtfly → no final só o loadstring limpo
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "scripts-data.json");
const PASTEFY_API_KEY = process.env.PASTEFY_API_KEY;
const SHRTFLY_API_KEY = process.env.SHRTFLY_API_KEY;

if (!PASTEFY_API_KEY || !SHRTFLY_API_KEY) {
  console.error("❌ Faltam PASTEFY_API_KEY e/ou SHRTFLY_API_KEY");
  process.exit(1);
}

async function uploadToPastefy(title, content) {
  const res = await fetch("https://pastefy.app/api/v2/paste", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PASTEFY_API_KEY}`
    },
    body: JSON.stringify({
      title: title,
      content: content,
      visibility: "UNLISTED",
      type: "PASTE"
    })
  });

  const data = await res.json();

  if (!res.ok || !data.paste?.id) {
    console.log("Resposta Pastefy:", JSON.stringify(data, null, 2));
    throw new Error("Falha ao criar paste no Pastefy");
  }

  return {
    id: data.paste.id,
    raw: `https://pastefy.app/${data.paste.id}/raw`
  };
}

async function shortenWithShrtfly(longUrl) {
  const apiUrl = `https://shrtfly.com/api?api=${SHRTFLY_API_KEY}&url=${encodeURIComponent(longUrl)}&format=json`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  console.log("  ↳ Resposta Shrtfly:", JSON.stringify(data));

  const short =
    data.shortenedUrl ||
    data.shortened_url ||
    data.short ||
    data.url ||
    data.link ||
    data.result?.shortenedUrl ||
    data.result?.url ||
    data.data?.url ||
    data.data?.shortenedUrl;

  if (!short) {
    throw new Error("Não consegui pegar o link encurtado do Shrtfly");
  }

  return short;
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error("❌ scripts-data.json não encontrado!");
    process.exit(1);
  }

  const scripts = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  console.log(`\n🚀 Processando ${scripts.length} scripts (fluxo simples)...\n`);

  for (const script of scripts) {
    if (script.linkShrtfly) {
      console.log(`[pulado] ${script.jogo} — ${script.hub}`);
      skipped++;
      continue;
    }

    try {
      console.log(`\n[processando] ${script.jogo} | ${script.hub}`);

      // Conteúdo da paste = só o loadstring limpo apontando pro original
      const loadstringLimpo = `loadstring(game:HttpGet("${script.loadstringOriginal}"))()`;

      // 1. Sobe no Pastefy
      const paste = await uploadToPastefy(
        `${script.jogo} - ${script.hub}`,
        loadstringLimpo
      );
      console.log(`  ✓ Pastefy RAW: ${paste.raw}`);
      script.pastefyRaw = paste.raw;
      script.loadstringFinal = loadstringLimpo;

      // 2. Encurta o RAW no Shrtfly
      const shortUrl = await shortenWithShrtfly(paste.raw);
      console.log(`  ✓ Shrtfly: ${shortUrl}`);
      script.linkShrtfly = shortUrl;

      processed++;
    } catch (err) {
      console.log(`  ✗ Erro: ${err.message}`);
      errors++;
    }

    // Pausa entre requests
    await new Promise(r => setTimeout(r, 1200));
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(scripts, null, 2), "utf-8");

  console.log(`\n✅ Finalizado!`);
  console.log(`   Processados: ${processed}`);
  console.log(`   Pulados: ${skipped}`);
  console.log(`   Erros: ${errors}`);
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
