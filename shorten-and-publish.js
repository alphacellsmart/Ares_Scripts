/**
 * shorten-and-publish.js
 * Pipeline completo:
 * 1. Lê scripts-data.json
 * 2. Baixa o conteúdo real de cada loadstring
 * 3. Sobe no Pastefy (UNLISTED)
 * 4. Pega o RAW
 * 5. Encurta no Shrtfly
 * 6. Salva de volta no JSON
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "scripts-data.json");
const PASTEFY_API_KEY = process.env.PASTEFY_API_KEY;
const SHRTFLY_API_KEY = process.env.SHRTFLY_API_KEY;

if (!PASTEFY_API_KEY || !SHRTFLY_API_KEY) {
  console.error("❌ Faltam as variáveis PASTEFY_API_KEY e/ou SHRTFLY_API_KEY");
  process.exit(1);
}

async function fetchLoadstringContent(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
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

  return `https://pastefy.app/${data.paste.id}/raw`;
}

async function shortenWithShrtfly(longUrl) {
  const apiUrl = `https://shrtfly.com/api?api=\( {SHRTFLY_API_KEY}&url= \){encodeURIComponent(longUrl)}&format=json`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  // Tenta vários campos comuns
  const short = data.shortenedUrl || data.short || data.url || data.result?.shortenedUrl;

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

  console.log(`\n🚀 Iniciando processamento de ${scripts.length} scripts...\n`);

  for (const script of scripts) {
    if (script.linkShrtfly) {
      console.log(`[pulado] ${script.jogo} — já tem link`);
      continue;
    }

    try {
      console.log(`\n[processando] ${script.jogo} | ${script.hub}`);

      const conteudo = await fetchLoadstringContent(script.loadstringOriginal);
      console.log(`  ✓ Código baixado (${conteudo.length} caracteres)`);

      const rawUrl = await uploadToPastefy(`${script.jogo} - ${script.hub}`, conteudo);
      console.log(`  ✓ Pastefy: ${rawUrl}`);
      script.pastefyRaw = rawUrl;

      const shortUrl = await shortenWithShrtfly(rawUrl);
      console.log(`  ✓ Shrtfly: ${shortUrl}`);
      script.linkShrtfly = shortUrl;

      // Formato final que vai pro botão
      script.loadstringFinal = `loadstring(game:HttpGet("${rawUrl}"))()`;

      processed++;
    } catch (err) {
      console.log(`  ✗ Erro: ${err.message}`);
      errors++;
    }

    // Evita rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(scripts, null, 2), "utf-8");

  console.log(`\n✅ Finalizado!`);
  console.log(`   Processados com sucesso: ${processed}`);
  console.log(`   Erros: ${errors}`);
  console.log(`   Total no arquivo: ${scripts.length}`);
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
