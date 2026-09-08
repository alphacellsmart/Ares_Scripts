/**
 * shorten-and-publish.js
 *
 * Fluxo:
 * 1. Baixa o código real do loadstringOriginal
 * 2. Sobe o código no Pastefy → pastefyRaw (conteúdo real)
 * 3. Cria uma SEGUNDA paste só com:
 *      loadstring(game:HttpGet("pastefyRaw"))()
 * 4. Encurta essa segunda paste no Shrtfly → linkShrtfly
 * 5. GET SCRIPT na página aponta pro linkShrtfly
 *    → pessoa passa pelo encurtador e no final vê só o loadstring limpo
 *
 * Uso:
 *   export PASTEFY_API_KEY="..."
 *   export SHRTFLY_API_KEY="..."
 *   node shorten-and-publish.js
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

async function fetchLoadstringContent(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  if (!res.ok) throw new Error(`Falha ao baixar conteúdo (status ${res.status})`);
  return res.text();
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

  const short =
    data.shortenedUrl ||
    data.short ||
    data.url ||
    data.result?.shortenedUrl ||
    data.data?.url;

  if (!short) {
    console.log("Resposta Shrtfly:", JSON.stringify(data, null, 2));
    throw new Error("Não consegui pegar o link encurtado do Shrtfly");
  }

  return short;
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error("❌ Arquivo scripts-data.json não encontrado!");
    process.exit(1);
  }

  const scripts = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  console.log(`\n🚀 Processando ${scripts.length} scripts...\n`);

  for (const script of scripts) {
    // Se já tem o novo fluxo completo, pula
    // Para forçar reprocessar, apague linkShrtfly do JSON
    if (script.linkShrtfly && script.pastefyRaw && script.loadstringFinal) {
      console.log(`[pulado] ${script.jogo} — ${script.hub}`);
      skipped++;
      continue;
    }

    try {
      console.log(`\n[processando] ${script.jogo} | ${script.hub}`);

      // 1. Baixa o código real
      const conteudo = await fetchLoadstringContent(script.loadstringOriginal);
      console.log(`  ✓ Código baixado (${conteudo.length} caracteres)`);

      // 2. Sobe o código real no Pastefy
      const pasteReal = await uploadToPastefy(
        `${script.jogo} - ${script.hub} [CODE]`,
        conteudo
      );
      console.log(`  ✓ Código no Pastefy: ${pasteReal.raw}`);
      script.pastefyRaw = pasteReal.raw;

      // 3. Cria paste SÓ com o loadstring limpo apontando pro código
      const loadstringLimpo = `loadstring(game:HttpGet("${pasteReal.raw}"))()`;
      const pasteLoadstring = await uploadToPastefy(
        `${script.jogo} - ${script.hub}`,
        loadstringLimpo
      );
      console.log(`  ✓ Loadstring no Pastefy: ${pasteLoadstring.raw}`);

      // 4. Encurta a paste do loadstring (não a do código)
      const shortUrl = await shortenWithShrtfly(pasteLoadstring.raw);
      console.log(`  ✓ Shrtfly: ${shortUrl}`);
      script.linkShrtfly = shortUrl;

      // 5. Guarda o loadstring final
      script.loadstringFinal = loadstringLimpo;

      processed++;
    } catch (err) {
      console.log(`  ✗ Erro: ${err.message}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 1500));
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
