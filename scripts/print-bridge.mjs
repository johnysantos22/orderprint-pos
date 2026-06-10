import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PRINT_BRIDGE_PORT ?? process.env.PORT ?? 3001);
const PAPER_WIDTH = Number(process.env.PRINT_BRIDGE_PAPER_WIDTH ?? 228);
const RECEIPT_WIDTH = 32;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const printScript = `
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,

  [string]$PrinterName = "",
  [string]$LogoPath = "",
  [int]$BottomFeed = 1,
  [int]$PaperWidth = 228
)

Add-Type -AssemblyName System.Drawing

$rawText = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
$rawText = $rawText.TrimEnd([char[]]@([char]13, [char]10))
if ($rawText.Length -eq 0) {
  $script:lines = @()
} else {
  $script:lines = $rawText -split "\\r?\\n"
}

$script:lineIndex = 0
$script:logoDrawn = $false

$font = New-Object System.Drawing.Font("Consolas", 8)
$brush = [System.Drawing.Brushes]::Black
$lineHeight = [int][Math]::Ceiling($font.GetHeight()) + 1
$logo = $null
$logoWidth = 0
$logoHeight = 0

if (![string]::IsNullOrWhiteSpace($LogoPath) -and [System.IO.File]::Exists($LogoPath)) {
  $logo = [System.Drawing.Image]::FromFile($LogoPath)
  $logoWidth = [int][Math]::Min(72, [Math]::Max(40, $PaperWidth - 24))
  $logoHeight = [int][Math]::Round($logo.Height * ($logoWidth / $logo.Width))
}

$bottomLines = [Math]::Max(0, [Math]::Min($BottomFeed, 8))
$paperHeight = [int][Math]::Max(
  170,
  (($script:lines.Length + $bottomLines) * $lineHeight) + $logoHeight + 35
)
$paperHeight = [int][Math]::Min($paperHeight, 3000)

$document = New-Object System.Drawing.Printing.PrintDocument
$document.DocumentName = "Pedido Pizzaria 2 Irmaos"
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(3, 3, 3, 3)
$document.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("Cupom", $PaperWidth, $paperHeight)

if (![string]::IsNullOrWhiteSpace($PrinterName)) {
  $document.PrinterSettings.PrinterName = $PrinterName
}

if (!$document.PrinterSettings.IsValid) {
  throw "Impressora invalida ou nao instalada: $PrinterName"
}

$document.add_PrintPage({
  param($sender, $event)

  $x = $event.MarginBounds.Left
  $y = $event.MarginBounds.Top
  $event.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit

  if ($logo -ne $null -and !$script:logoDrawn) {
    $drawX = [int]($event.MarginBounds.Left + (($event.MarginBounds.Width - $logoWidth) / 2))
    $destRect = New-Object System.Drawing.Rectangle($drawX, $y, $logoWidth, $logoHeight)
    $attrs = New-Object System.Drawing.Imaging.ImageAttributes
    $matrix = New-Object System.Drawing.Imaging.ColorMatrix

    $matrix.Matrix00 = 0.299
    $matrix.Matrix01 = 0.299
    $matrix.Matrix02 = 0.299
    $matrix.Matrix10 = 0.587
    $matrix.Matrix11 = 0.587
    $matrix.Matrix12 = 0.587
    $matrix.Matrix20 = 0.114
    $matrix.Matrix21 = 0.114
    $matrix.Matrix22 = 0.114
    $matrix.Matrix33 = 1
    $matrix.Matrix44 = 1

    $attrs.SetColorMatrix($matrix)
    $event.Graphics.DrawImage(
      $logo,
      $destRect,
      0,
      0,
      $logo.Width,
      $logo.Height,
      [System.Drawing.GraphicsUnit]::Pixel,
      $attrs
    )
    $attrs.Dispose()
    $y += $logoHeight + 4
    $script:logoDrawn = $true
  }

  while ($script:lineIndex -lt $script:lines.Length) {
    $event.Graphics.DrawString($script:lines[$script:lineIndex], $font, $brush, $x, $y)
    $y += $lineHeight
    $script:lineIndex++

    if (($y + $lineHeight) -gt $event.MarginBounds.Bottom) {
      $event.HasMorePages = $true
      return
    }
  }

  $event.HasMorePages = $false
})

try {
  $document.Print()
} finally {
  if ($logo -ne $null) {
    $logo.Dispose()
  }
  $document.Dispose()
  $font.Dispose()
}
`;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 2_000_000) {
        request.destroy();
        reject(new Error("Payload muito grande."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", args, {
      windowsHide: true,
    });

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `PowerShell saiu com codigo ${code}.`));
    });
  });
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function divider(char = "-") {
  return char.repeat(RECEIPT_WIDTH);
}

function center(text) {
  if (text.length >= RECEIPT_WIDTH) return text;
  const leftPadding = Math.floor((RECEIPT_WIDTH - text.length) / 2);
  return `${" ".repeat(leftPadding)}${text}`;
}

function leftRight(left, right) {
  const cleanRight = String(right);
  const spaces = RECEIPT_WIDTH - left.length - cleanRight.length;

  if (spaces <= 1) {
    return `${left}\n${cleanRight.padStart(RECEIPT_WIDTH)}`;
  }

  return `${left}${" ".repeat(spaces)}${cleanRight}`;
}

function wrapText(text, width = RECEIPT_WIDTH) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > width) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }

      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > width) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = nextLine;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function formatCurrency(value) {
  return asNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatItem(item) {
  const quantidade = asNumber(item?.quantidade ?? item?.qty, 1);
  const nome = asText(item?.nome) || asText(item?.name) || "Item";
  const tamanho = asText(item?.tamanho) || asText(item?.size);
  const precoUnitario = asNumber(item?.precoUnitario ?? item?.unitPrice ?? item?.preco);
  const label = `${quantidade}x ${nome}${tamanho ? ` (${tamanho})` : ""}`;

  return {
    label,
    quantidade,
    precoUnitario,
    total: precoUnitario * quantidade,
  };
}

function createReceiptText(payload) {
  const tipoCupom = asText(payload.tipoCupom).toLowerCase();
  const conferencia = tipoCupom === "conferencia";
  const labelPessoa =
    asText(payload.rotuloPessoa) ||
    asText(payload.rotuloCliente) ||
    asText(payload.labelCliente) ||
    (conferencia ? "Atendente" : "Cliente");
  const pessoa = conferencia
    ? asText(payload.atendente) || asText(payload.garcom) || asText(payload.cliente)
    : asText(payload.cliente) || asText(payload.atendente) || asText(payload.garcom);
  const mesa = asText(payload.mesa);
  const telefone = asText(payload.telefone);
  const origem = asText(payload.origem);
  const titulo = asText(payload.titulo) || (conferencia ? "*** CONFERENCIA ***" : "PEDIDO");
  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  const observacoes = asText(payload.observacoes);
  const data = formatDateTime(payload.data);

  const lines = [center("PIZZARIA 2 IRMAOS"), center("Tel: (84) 99813-5262"), divider("=")];

  if (conferencia) {
    lines.push(center(titulo), divider("-"));
  }

  if (payload.id) {
    lines.push(leftRight("Pedido:", `#${String(payload.id).slice(0, 8).toUpperCase()}`));
  }
  if (data) lines.push(leftRight("Data:", data));
  if (origem) lines.push(leftRight("Origem:", origem));
  if (mesa) lines.push(leftRight("Mesa:", mesa));
  if (pessoa) lines.push(leftRight(`${labelPessoa}:`, pessoa));
  if (telefone && !conferencia) lines.push(leftRight("Telefone:", telefone));

  lines.push(divider("-"), "ITENS");

  for (const item of itens) {
    const formatted = formatItem(item);
    const itemTotal = formatCurrency(formatted.total);
    const itemLines = wrapText(formatted.label, RECEIPT_WIDTH - itemTotal.length - 1);

    if (itemLines.length === 0) {
      lines.push(itemTotal.padStart(RECEIPT_WIDTH));
      continue;
    }

    lines.push(leftRight(itemLines[0], itemTotal));
    itemLines.slice(1).forEach((line) => lines.push(line));
    lines.push(`  un: ${formatCurrency(formatted.precoUnitario)}`);
  }

  lines.push(divider("-"));

  if (Number.isFinite(Number(payload.subtotal))) {
    lines.push(leftRight("Subtotal:", formatCurrency(payload.subtotal)));
  }

  if (asNumber(payload.taxaEntrega) > 0) {
    lines.push(leftRight("Entrega:", formatCurrency(payload.taxaEntrega)));
  }

  if (asNumber(payload.taxaServico) > 0) {
    lines.push(leftRight("Taxa serv.:", formatCurrency(payload.taxaServico)));
  }

  lines.push(leftRight("TOTAL:", formatCurrency(payload.total)));

  if (observacoes) {
    lines.push(divider("-"), "OBS:", ...wrapText(observacoes));
  }

  lines.push(divider("="));
  if (!conferencia) {
    lines.push(center("Obrigado pela preferencia!"));
  }

  return lines.join("\n");
}

function decodeLogoBase64(value) {
  const logoBase64 = asText(value);
  if (!logoBase64) return null;

  const match = logoBase64.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  const rawBase64 = match ? match[2] : logoBase64;
  const extension = match?.[1]?.toLowerCase().includes("png") ? "png" : "jpg";

  try {
    return {
      buffer: Buffer.from(rawBase64, "base64"),
      extension,
    };
  } catch {
    return null;
  }
}

async function printText(text, printerName, options = {}) {
  if (process.platform !== "win32") {
    throw new Error("A ponte de impressao direta foi preparada para Windows.");
  }

  const jobId = randomUUID();
  const textPath = join(tmpdir(), `orderprint-${jobId}.txt`);
  const scriptPath = join(tmpdir(), `orderprint-${jobId}.ps1`);
  const logo = decodeLogoBase64(options.logoBase64 ?? options.logoDataUrl);
  const logoPath = logo ? join(tmpdir(), `orderprint-logo-${jobId}.${logo.extension}`) : "";
  const bottomFeed = Math.max(
    0,
    Math.min(
      asNumber(options.bottomFeedLines ?? options.linhasCorte ?? options.espacoCorteLinhas, 1),
      8,
    ),
  );
  const paperWidth = Math.max(
    180,
    asNumber(options.paperWidth ?? options.larguraPapel, PAPER_WIDTH),
  );

  try {
    await writeFile(textPath, text, "utf8");
    await writeFile(scriptPath, printScript, "utf8");
    if (logo && logoPath) {
      await writeFile(logoPath, logo.buffer);
    }

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Path",
      textPath,
      "-BottomFeed",
      String(bottomFeed),
      "-PaperWidth",
      String(paperWidth),
    ];

    if (printerName) {
      args.push("-PrinterName", printerName);
    }

    if (logoPath) {
      args.push("-LogoPath", logoPath);
    }

    await runPowerShell(args);
  } finally {
    await Promise.allSettled([
      unlink(textPath),
      unlink(scriptPath),
      logoPath ? unlink(logoPath) : Promise.resolve(),
    ]);
  }
}

async function listPrinters() {
  const command =
    "Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress";
  const output = await runPowerShell(["-NoProfile", "-Command", command]);

  if (!output.trim()) {
    return [];
  }

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function parseJsonBody(request) {
  const body = await readBody(request);
  return body.trim() ? JSON.parse(body) : {};
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && request.url === "/printers") {
      sendJson(response, 200, { printers: await listPrinters() });
      return;
    }

    if (request.method === "POST" && request.url === "/print") {
      const payload = await parseJsonBody(request);
      const text = asText(payload.text);
      const printerName = asText(payload.printerName);

      if (!text) {
        sendJson(response, 400, { ok: false, error: "Texto do cupom vazio." });
        return;
      }

      await printText(text, printerName, payload);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/imprimir") {
      const payload = await parseJsonBody(request);
      const text = asText(payload.text) || createReceiptText(payload);
      const printerName = asText(payload.printerName);

      if (!text.trim()) {
        sendJson(response, 400, { ok: false, error: "Cupom vazio." });
        return;
      }

      await printText(text, printerName, payload);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { ok: false, error: "Rota nao encontrada." });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Ponte de impressao ativa em http://127.0.0.1:${PORT}`);
  console.log("Rotas disponiveis: POST /imprimir e POST /print.");
  console.log("Usando a impressora padrao do Windows quando printerName nao for informado.");
});
