const PRINT_BRIDGE_URL = "http://127.0.0.1:3333";

interface PrintResponse {
  ok?: boolean;
  error?: string;
}

export async function printTextOnDefaultPrinter(text: string) {
  const response = await fetch(`${PRINT_BRIDGE_URL}/print`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  let payload: PrintResponse | null = null;

  try {
    payload = (await response.json()) as PrintResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? "Falha ao enviar cupom para a impressora padrao.");
  }
}
