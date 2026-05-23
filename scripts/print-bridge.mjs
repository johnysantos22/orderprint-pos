import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PRINT_BRIDGE_PORT ?? 3333);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const printScript = `
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,

  [string]$PrinterName = ""
)

Add-Type -AssemblyName System.Drawing

$script:lines = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) -split "\\r?\\n"
$script:lineIndex = 0

$font = New-Object System.Drawing.Font("Consolas", 8)
$brush = [System.Drawing.Brushes]::Black
$document = New-Object System.Drawing.Printing.PrintDocument
$document.DocumentName = "Pedido Pizzaria 2 Irmaos"
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(5, 5, 5, 5)
$document.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("Cupom 80mm", 315, 1200)

if (![string]::IsNullOrWhiteSpace($PrinterName)) {
  $document.PrinterSettings.PrinterName = $PrinterName
}

if (!$document.PrinterSettings.IsValid) {
  throw "Impressora inválida ou não instalada: $PrinterName"
}

$document.add_PrintPage({
  param($sender, $event)

  $x = $event.MarginBounds.Left
  $y = $event.MarginBounds.Top
  $lineHeight = [int][Math]::Ceiling($font.GetHeight($event.Graphics)) + 1

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

$document.Print()
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

      if (body.length > 1_000_000) {
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

      reject(new Error(stderr.trim() || `PowerShell saiu com código ${code}.`));
    });
  });
}

async function printText(text, printerName) {
  if (process.platform !== "win32") {
    throw new Error("A ponte de impressão direta foi preparada para Windows.");
  }

  const jobId = randomUUID();
  const textPath = join(tmpdir(), `orderprint-${jobId}.txt`);
  const scriptPath = join(tmpdir(), `orderprint-${jobId}.ps1`);

  try {
    await writeFile(textPath, text, "utf8");
    await writeFile(scriptPath, printScript, "utf8");

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Path",
      textPath,
    ];

    if (printerName) {
      args.push("-PrinterName", printerName);
    }

    await runPowerShell(args);
  } finally {
    await Promise.allSettled([unlink(textPath), unlink(scriptPath)]);
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
      const body = await readBody(request);
      const payload = JSON.parse(body);
      const text = typeof payload.text === "string" ? payload.text : "";
      const printerName = typeof payload.printerName === "string" ? payload.printerName.trim() : "";

      if (!text.trim()) {
        sendJson(response, 400, { ok: false, error: "Texto do cupom vazio." });
        return;
      }

      await printText(text, printerName);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { ok: false, error: "Rota não encontrada." });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Ponte de impressão ativa em http://127.0.0.1:${PORT}`);
  console.log("Usando a impressora padrão do Windows quando printerName não for informado.");
});
