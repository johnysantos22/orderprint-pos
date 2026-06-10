import logo from "@/assets/logo.jpeg";

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
  waiter?: string;
  table?: string;
  notes?: string;
  orderNumber: number | string; // Aceita string caso você use o ID do Firebase
  // --- NOVOS CAMPOS ADICIONADOS ---
  customerName?: string;
  address?: string;
  deliveryType?: string; // "ENTREGAR" | "RETIRAR" | "NO_LOCAL"
}

export function OrderTicket({
  items,
  total,
  waiter,
  table,
  notes,
  orderNumber,
  customerName,
  address,
  deliveryType,
}: OrderTicketProps) {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR");
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const isDelivery = deliveryType === "ENTREGAR";

  return (
    <div className="print-ticket">
      {/* --- CABEÇALHO --- */}
      <img src={logo} alt="Logo" />
      <div className="t-center t-bold t-xl">PIZZARIA 2 IRMÃOS</div>
      <div className="t-center t-md">Tel: (84) 99813-5262</div>
      <div className="t-divider">================================</div>

      <div className="t-row">
        <span className="t-md">Pedido:</span>
        <span className="t-bold t-lg">#{String(orderNumber).substring(0, 6).toUpperCase()}</span>
      </div>
      <div className="t-row mb-1">
        <span className="t-md">Data:</span>
        <span className="t-md">
          {date} {time}
        </span>
      </div>

      <div className="t-divider">--------------------------------</div>

      {/* --- LÓGICA DE EXIBIÇÃO: MOTOBOY VS GARÇOM --- */}
      {isDelivery ? (
        // LAYOUT PARA ENTREGA (MOTOBOY)
        <div className="t-delivery-box">
          <div className="t-center t-bold t-lg mb-1">*** DELIVERY ***</div>
          <div className="t-row">
            <span className="t-md">Cliente:</span>
            <span className="t-bold t-md">{customerName || "Não informado"}</span>
          </div>
          <div className="t-col mt-1">
            <span className="t-bold t-lg">ENDEREÇO DE ENTREGA:</span>
            <span className="t-lg leading-tight t-bold">{address || "Endereço não informado"}</span>
          </div>
        </div>
      ) : (
        // LAYOUT PARA CONSUMO NO LOCAL (GARÇOM) OU RETIRADA
        <div className="t-local-box">
          <div className="t-center t-bold t-lg mb-1">
            {table ? "*** MESA ***" : "*** RETIRADA BALCÃO ***"}
          </div>
          {table && (
            <div className="t-row mt-1">
              <span className="t-lg">Número da Mesa:</span>
              <span className="t-bold t-xl">{table}</span>
            </div>
          )}
          {waiter && (
            <div className="t-row mt-1">
              <span className="t-md">Atendente:</span>
              <span className="t-bold t-md">{waiter}</span>
            </div>
          )}
          {customerName && !table && (
            <div className="t-row mt-1">
              <span className="t-md">Cliente:</span>
              <span className="t-bold t-md">{customerName}</span>
            </div>
          )}
        </div>
      )}

      <div className="t-divider">--------------------------------</div>

      {/* --- ITENS --- */}
      <div className="t-bold t-lg mb-1">ITENS:</div>
      {items.map((i) => (
        <div key={i.key} className="t-item">
          <div className="t-row">
            <span className="t-md t-bold">
              {i.qty}x {i.name} {i.size ? `(${i.size})` : ""}
            </span>
            <span className="t-md">R$ {(i.unitPrice * i.qty).toFixed(2)}</span>
          </div>
          <div className="t-sm t-muted"> un: R$ {i.unitPrice.toFixed(2)}</div>
        </div>
      ))}

      <div className="t-divider">--------------------------------</div>

      {/* --- OBSERVAÇÕES --- */}
      {notes && (
        <>
          <div className="t-bold t-md">OBSERVAÇÕES:</div>
          <div className="t-md leading-tight">{notes}</div>
          <div className="t-divider">--------------------------------</div>
        </>
      )}

      {/* --- TOTAL --- */}
      <div className="t-row t-bold t-xl mt-1">
        <span>TOTAL:</span>
        <span>R$ {total.toFixed(2)}</span>
      </div>

      <div className="t-divider">================================</div>
      <div className="t-center t-sm">Obrigado pela preferência!</div>
    </div>
  );
}
