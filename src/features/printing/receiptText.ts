import { formatCurrency, formatDateTime } from "@/shared/utils/format";

const RECEIPT_WIDTH = 32;

export interface ReceiptItem {
  key: string;
  nome: string;
  precoUnitario: number;
  quantidade: number;
  tamanho?: string;
}

export interface ReceiptOrder {
  id: string;
  data: string;
  origem: string;
  pagamento?: string;
  itens: ReceiptItem[];
  subtotal?: number;
  taxaEntrega?: number;
  total: number;
  observacoes?: string;
  mesa?: string;
  garcom?: string;
  cliente?: {
    nome: string;
    endereco?: string;
  };
}

const divider = (char: "=" | "-") => char.repeat(RECEIPT_WIDTH);

const center = (text: string) => {
  if (text.length >= RECEIPT_WIDTH) return text;
  const leftPadding = Math.floor((RECEIPT_WIDTH - text.length) / 2);
  return `${" ".repeat(leftPadding)}${text}`;
};

const leftRight = (left: string, right: string) => {
  const spaces = RECEIPT_WIDTH - left.length - right.length;
  if (spaces <= 1) {
    return `${left}\n${right.padStart(RECEIPT_WIDTH)}`;
  }

  return `${left}${" ".repeat(spaces)}${right}`;
};

const wrapText = (text: string, width = RECEIPT_WIDTH) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    if (word.length > width) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }

      return;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > width) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = nextLine;
  });

  if (currentLine) lines.push(currentLine);
  return lines;
};

const itemLabel = (item: ReceiptItem) =>
  `${item.quantidade}x ${item.nome}${item.tamanho ? ` (${item.tamanho})` : ""}`;

export function createReceiptText(order: ReceiptOrder) {
  const lines = [
    center("PIZZARIA 2 IRMAOS"),
    center("Tel: (84) 99813-5262"),
    divider("="),
    leftRight("Pedido:", `#${order.id.slice(0, 8).toUpperCase()}`),
    leftRight("Data:", formatDateTime(order.data)),
    leftRight("Origem:", order.origem),
  ];

  if (order.cliente?.nome) lines.push(leftRight("Cliente:", order.cliente.nome));
  if (order.cliente?.endereco) lines.push("Endereco:", ...wrapText(order.cliente.endereco));
  if (order.mesa) lines.push(leftRight("Mesa:", order.mesa));
  if (order.garcom) lines.push(leftRight("Garcom:", order.garcom));
  if (order.pagamento) lines.push(leftRight("Pagamento:", order.pagamento));

  lines.push(divider("-"), "ITENS");

  order.itens.forEach((item) => {
    const itemTotal = formatCurrency(item.precoUnitario * item.quantidade);
    const itemLines = wrapText(itemLabel(item), RECEIPT_WIDTH - itemTotal.length - 1);

    if (itemLines.length === 0) {
      lines.push(itemTotal.padStart(RECEIPT_WIDTH));
      return;
    }

    lines.push(leftRight(itemLines[0], itemTotal));
    itemLines.slice(1).forEach((line) => lines.push(line));
    lines.push(`  un: ${formatCurrency(item.precoUnitario)}`);
  });

  lines.push(divider("-"));

  if (typeof order.subtotal === "number")
    lines.push(leftRight("Subtotal:", formatCurrency(order.subtotal)));
  if (typeof order.taxaEntrega === "number" && order.taxaEntrega > 0) {
    lines.push(leftRight("Entrega:", formatCurrency(order.taxaEntrega)));
  }

  lines.push(leftRight("TOTAL:", formatCurrency(order.total)));

  if (order.observacoes?.trim()) {
    lines.push(divider("-"), "OBS:", ...wrapText(order.observacoes.trim()));
  }

  lines.push(divider("="), center("Obrigado pela preferencia!"), "");

  return lines.join("\n");
}
