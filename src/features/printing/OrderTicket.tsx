type Item = {
  key: string;
  name: string;
  size?: string;
  unitPrice: number;
  qty: number;
};

interface OrderTicketProps {
  items: Item[];
  total: number;
  waiter: string;
  table: string;
  notes: string;
  orderNumber: number;
}

export function OrderTicket({ items, total, waiter, table, notes, orderNumber }: OrderTicketProps) {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR");
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="print-ticket">
      <div className="t-center t-bold t-lg">PIZZARIA 2 IRMÃOS</div>
      <div className="t-center t-sm">Tel: (84) 99813-5262</div>
      <div className="t-divider">================================</div>
      <div className="t-row">
        <span>Pedido Nº:</span>
        <span className="t-bold">#{String(orderNumber).padStart(4, "0")}</span>
      </div>
      <div className="t-row">
        <span>Data:</span>
        <span>
          {date} {time}
        </span>
      </div>
      <div className="t-row">
        <span>Mesa:</span>
        <span className="t-bold t-lg">{table || "-"}</span>
      </div>
      {waiter && (
        <div className="t-row">
          <span>Garçom:</span>
          <span>{waiter}</span>
        </div>
      )}
      <div className="t-divider">--------------------------------</div>
      <div className="t-bold">ITENS:</div>
      {items.map((i) => (
        <div key={i.key} className="t-item">
          <div className="t-row">
            <span>
              {i.qty}x {i.name}
              {i.size ? ` (${i.size})` : ""}
            </span>
            <span>R$ {(i.unitPrice * i.qty).toFixed(2)}</span>
          </div>
          <div className="t-sm t-muted"> un: R$ {i.unitPrice.toFixed(2)}</div>
        </div>
      ))}
      <div className="t-divider">--------------------------------</div>
      {notes && (
        <>
          <div className="t-bold">OBSERVAÇÕES:</div>
          <div className="t-sm">{notes}</div>
          <div className="t-divider">--------------------------------</div>
        </>
      )}
      <div className="t-row t-bold t-lg">
        <span>TOTAL:</span>
        <span>R$ {total.toFixed(2)}</span>
      </div>
      <div className="t-divider">================================</div>
      <div className="t-center t-sm">Obrigado pela preferência!</div>
      <div className="t-center t-sm">Cartões: Visa · Master · Hipercard · Elo · Pix</div>
    </div>
  );
}
