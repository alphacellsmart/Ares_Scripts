/**
 * Fluxo:
 * 1. Cria paste no Pastefy só com: loadstring(game:HttpGet("URL"))()
 * 2. Tenta encurtar no Shrtfly
 * 3. Se Shrtfly falhar, usa o pastefyRaw mesmo (já é o loadstring limpo)
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "scripts-data.json");
const PASTEFY_API_KEY = process.env.PASTEFY_API_KEY;
const SHRTFLY_API_KEY = process.env.SHRTFLY_API_KEY;

if (!PASTEFY_API_KEY) {
  console.error("❌ Falta PASTEFY_API_KEY");
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
  if (!SHRTFLY_API_KEY) {
    console.log("  ⚠ SHRTFLY_API_KEY não definida — pulando encurtador");
    return null;
  }

  // Tentativa 1: format=json
  const urlJson = `https://shrtfly.com/api?api=${encodeURIComponent(SHRTFLY_API_KEY)}&url=${encodeURIComponent(longUrl)}&format=json`;
  console.log("  ↳ Chamando Shrtfly (json)...");
  let res = await fetch(urlJson);
  let text = await res.text();
  console.log("  ↳ HTTP", res.status, "| body:", text.slice(0, 300));

  try {
    const data = JSON.parse(text);
    const short =
      data.shortenedUrl ||
      data.shortened_url ||
      data.short ||
      data.url ||
      data.link ||
      (data.status === "success" && (data.shortenedUrl || data.url)) ||
      data.result?.shortenedUrl ||
      data.data?.url;

    if (short && typeof short === "string" && short.startsWith("http")) {
      return short;
    }
    console.log("  ↳ JSON parseado mas sem URL válida:", JSON.stringify(data));
  } catch (e) {
    // pode ser texto puro
    if (text.startsWith("http")) {
      return text.trim();
    }
  }

  // Tentativa 2: format=text
  const urlText = `https://shrtfly.com/api?api=${encodeURIComponent(SHRTFLY_API_KEY)}&url=${encodeURIComponent(longUrl)}&format=text`;
  console.log("  ↳ Tentando Shrtfly (text)...");
  res = await fetch(urlText);
  text = await res.text();
  console.log("  ↳ HTTP", res.status, "| body:", text.slice(0, 300));

  if (text.startsWith("http")) {
    return text.trim();
  }

  return null;
}

async function main() {
  const scripts = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  let processed = 0;
  let errors = 0;

  console.log(`\n🚀 Teste com ${scripts.length} script(s)...\n`);

  for (const script of scripts) {
    if (script.linkShrtfly) {
      console.log(`[pulado] já tem linkShrtfly`);
      continue;
    }

    try {
      console.log(`[processando] ${script.jogo} | ${script.hub}`);

      const loadstringLimpo = `loadstring(game:HttpGet("${script.loadstringOriginal}"))()`;

      const paste = await uploadToPastefy(`${script.jogo} - ${script.hub}`, loadstringLimpo);
      console.log(`  ✓ Pastefy RAW: ${paste.raw}`);
      script.pastefyRaw = paste.raw;
      script.loadstringFinal = loadstringLimpo;

      const shortUrl = await shortenWithShrtfly(paste.raw);

      if (shortUrl) {
        console.log(`  ✓ Shrtfly: ${shortUrl}`);
        script.linkShrtfly = shortUrl;
      } else {
        // Fallback: usa o pastefyRaw (já é só o loadstring)
        console.log(`  ⚠ Shrtfly falhou — usando pastefyRaw como link do botão`);
        script.linkShrtfly = paste.raw;
      }

      processed++;
    } catch (err) {
      console.log(`  ✗ Erro: ${err.message}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(scripts, null, 2), "utf-8");
  console.log(`\n✅ Processados: ${processed} | Erros: ${errors}`);
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
