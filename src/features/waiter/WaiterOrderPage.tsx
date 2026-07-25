import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  UserRound,
  AlertTriangle,
  X,
  Ban,
} from "lucide-react";
import { PinLock } from "@/shared/components/PinLock";
import { bebidas, pasteis, pizzas, porcoes, sucos, type PizzaSize } from "@/domain/menu/menu";
import { formatCurrency } from "@/shared/utils/format";
import { doc, setDoc, onSnapshot, collection, query } from "firebase/firestore";
import { db } from "@/services/firebase";

type CategoriaCarrinho = "pizza" | "pastel" | "porcao" | "bebida" | "suco";
type PagamentoMesa = "A DEFINIR NO CAIXA";
type CategoriaMenu = "pizzas" | "pasteis" | "porcoes" | "bebidas" | "sucos";

export interface ItemCarrinhoGarcom {
  key: string;
  id: number;
  nome: string;
  categoria: CategoriaCarrinho;
  precoUnitario: number;
  quantidade: number;
  tamanho?: PizzaSize;
  meia?: {
    saborA: string;
    saborB: string;
  };
}

export interface EstadoPedidoGarcom {
  nomeGarcom: string;
  numeroMesa: string;
  observacoes: string;
  carrinho: ItemCarrinhoGarcom[];
}

interface PedidoMesa {
  id: string;
  data: string;
  origem: string;
  garcom: string;
  mesa: string;
  pagamento: PagamentoMesa;
  itens: ItemCarrinhoGarcom[];
  subtotal: number;
  taxaEntrega: number;
  taxaServico: number;
  total: number;
  impresso: boolean;
  observacoes?: string;
  status?: string;
}

const GARCOM_DRAFT_KEY = "garcom-comanda-rascunho";
const SUCO_AO_LEITE_ACRESCIMO = 1;
const tamanhosPizza: PizzaSize[] = ["M", "G", "GG"];

// Sistema de Abas (Tabs) igual ao do cliente
const tabs: { id: CategoriaMenu; label: string }[] = [
  { id: "pizzas", label: "Pizzas" },
  { id: "pasteis", label: "Pastéis" },
  { id: "porcoes", label: "Porções" },
  { id: "bebidas", label: "Bebidas" },
  { id: "sucos", label: "Sucos" },
];

interface GarcomDraft extends EstadoPedidoGarcom {
  meiaTamanho: PizzaSize;
  meiaSaborA: string;
  meiaSaborB: string;
  comboSaborA: string;
  comboSaborB: string;
}

const garcomDraftDefault: GarcomDraft = {
  nomeGarcom: "",
  numeroMesa: "",
  observacoes: "",
  carrinho: [],
  meiaTamanho: "G",
  meiaSaborA: String(pizzas[0]?.id ?? ""),
  meiaSaborB: String(pizzas[1]?.id ?? ""),
  comboSaborA: String(pizzas.filter(p => !p.name.toLowerCase().includes("camarão") && !p.name.toLowerCase().includes("atum"))[0]?.id ?? ""),
  comboSaborB: String(pizzas.filter(p => !p.name.toLowerCase().includes("camarão") && !p.name.toLowerCase().includes("atum"))[1]?.id ?? ""),
};

const lerGarcomDraft = (): GarcomDraft => {
  const raw = localStorage.getItem(GARCOM_DRAFT_KEY);
  if (!raw) return garcomDraftDefault;

  try {
    const parsed = JSON.parse(raw) as Partial<GarcomDraft>;
    return {
      ...garcomDraftDefault,
      ...parsed,
      carrinho: Array.isArray(parsed.carrinho) ? parsed.carrinho : [],
    };
  } catch {
    return garcomDraftDefault;
  }
};

const gerarIdPedido = () =>
  globalThis.crypto?.randomUUID?.() ?? `MESA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export function WaiterOrderPage() {
  const [pinGarcom, setPinGarcom] = useState("5566");

  // Busca o PIN atualizado na nuvem antes de liberar o acesso
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "configuracoes", "seguranca"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().pinGarcom) {
        setPinGarcom(String(docSnap.data().pinGarcom));
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <PinLock correctPin={pinGarcom} title="Tela do Garçom">
      <GarcomPage />
    </PinLock>
  );
}

function GarcomPage() {
  const [rascunhoInicial] = useState(() => lerGarcomDraft());
  const [pedido, setPedido] = useState<EstadoPedidoGarcom>({
    nomeGarcom: rascunhoInicial.nomeGarcom,
    numeroMesa: rascunhoInicial.numeroMesa,
    observacoes: rascunhoInicial.observacoes,
    carrinho: rascunhoInicial.carrinho,
  });
  const [tab, setTab] = useState<CategoriaMenu>("pizzas"); // Controle da Aba Ativa
  const [meiaTamanho, setMeiaTamanho] = useState<PizzaSize>(rascunhoInicial.meiaTamanho);
  const [meiaSaborA, setMeiaSaborA] = useState(rascunhoInicial.meiaSaborA);
  const [meiaSaborB, setMeiaSaborB] = useState(rascunhoInicial.meiaSaborB);
  const [comboSaborA, setComboSaborA] = useState(rascunhoInicial.comboSaborA);
  const [comboSaborB, setComboSaborB] = useState(rascunhoInicial.comboSaborB);

  const [mensagemCarrinho, setMensagemCarrinho] = useState("");
  const [modalSucessoAberto, setModalSucessoAberto] = useState(false);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);

  // ESTADOS DE CONFIGURAÇÕES E ALERTAS
  const [esgotados, setEsgotados] = useState<number[]>([]);
  const [lojaAberta, setLojaAberta] = useState(true);
  const [horarioFuncionamento, setHorarioFuncionamento] = useState("🕒Quarta a Domingo | das 18h às 22h.");
  const [mesasAbertas, setMesasAbertas] = useState<string[]>([]);
  const [tipoComplemento, setTipoComplemento] = useState<"acrescimo" | "correcao">("acrescimo");
  const [menuOverrides, setMenuOverrides] = useState<Record<string, any>>({});
  const [alerta, setAlerta] = useState<{
    titulo: string;
    mensagem: string;
    tipo: "sucesso" | "erro" | "aviso";
  } | null>(null);
  const [confirmarAcao, setConfirmarAcao] = useState<{
    mensagem: string;
    onConfirm: () => void;
  } | null>(null);

  const mensagemTimeoutRef = useRef<number | null>(null);

  const subtotal = useMemo(
    () => pedido.carrinho.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0),
    [pedido.carrinho],
  );

  const total = subtotal;

  useEffect(() => {
    const draft: GarcomDraft = {
      ...pedido,
      meiaTamanho,
      meiaSaborA,
      meiaSaborB,
      comboSaborA,
      comboSaborB,
    };
    localStorage.setItem(GARCOM_DRAFT_KEY, JSON.stringify(draft));
  }, [meiaSaborA, meiaSaborB, meiaTamanho, pedido, comboSaborA, comboSaborB]);

  // ESPIÃO DO CARDÁPIO (Para travar botões de itens esgotados)
  useEffect(() => {
    const unsubscribeLoja = onSnapshot(doc(db, "configuracoes", "loja"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.aberta !== undefined) {
          setLojaAberta(data.aberta);
        }
        if (data.horarioFuncionamento) {
          setHorarioFuncionamento(data.horarioFuncionamento);
        }
      } else {
        setLojaAberta(true);
      }
    });

    const unsubscribeCardapio = onSnapshot(doc(db, "configuracoes", "cardapio"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setEsgotados(Array.isArray(data.esgotados) ? data.esgotados : []);
        setMenuOverrides(typeof data.overrides === 'object' && data.overrides !== null ? data.overrides : {});
      }
    });

    return () => {
      unsubscribeLoja();
      unsubscribeCardapio();
    };
  }, []);

  // ESPIÃO DE MESAS ABERTAS (Para identificar acréscimos/retiradas)
  useEffect(() => {
    const unsubscribePedidos = onSnapshot(query(collection(db, "pedidos")), (snap) => {
      const mesas = new Set<string>();
      snap.forEach((d) => {
        const p = d.data() as PedidoMesa;
        // Ignora "BALCÃO" para não criar mesa fantasma
        if (p.status !== "cancelado" && p.status !== "finalizado" && p.mesa && p.mesa !== "BALCÃO") {
          let mesaNormalizada = String(p.mesa).trim();
          if (/^\d+$/.test(mesaNormalizada)) {
            mesaNormalizada = parseInt(mesaNormalizada, 10).toString();
          }
          mesas.add(mesaNormalizada);
        }
      });
      setMesasAbertas(Array.from(mesas).sort((a, b) => Number(a) - Number(b)));
    });
    return () => unsubscribePedidos();
  }, []);

  // 👇 NOVA REGRA PARA BALCÃO 👇
  const isBalcao = pedido.numeroMesa === "BALCÃO";

  let mesaInputNormalizada = pedido.numeroMesa.trim();
  if (!isBalcao && /^\d+$/.test(mesaInputNormalizada)) {
    mesaInputNormalizada = parseInt(mesaInputNormalizada, 10).toString();
  }
  const isMesaAberta = !isBalcao && mesasAbertas.includes(mesaInputNormalizada);

  const avisarItemAdicionado = (nomeItem: string) => {
    setMensagemCarrinho(`${nomeItem} adicionado à mesa.`);
    if (mensagemTimeoutRef.current) window.clearTimeout(mensagemTimeoutRef.current);
    mensagemTimeoutRef.current = window.setTimeout(() => {
      setMensagemCarrinho("");
      mensagemTimeoutRef.current = null;
    }, 1800);
  };

  const adicionarItem = (item: Omit<ItemCarrinhoGarcom, "quantidade">) => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "O sistema está fechado no momento!",
        tipo: "aviso",
      });
      return;
    }
    if (esgotados.includes(item.id)) {
      setAlerta({
        titulo: "Esgotado",
        mensagem: "Aviso: Este item foi bloqueado pelo Caixa pois está ESGOTADO!",
        tipo: "erro",
      });
      return;
    }
    setPedido((estadoAtual) => {
      const existente = estadoAtual.carrinho.find((itemAtual) => itemAtual.key === item.key);
      const carrinho = existente
        ? estadoAtual.carrinho.map((itemAtual) =>
          itemAtual.key === item.key
            ? { ...itemAtual, quantidade: itemAtual.quantidade + 1 }
            : itemAtual,
        )
        : [...estadoAtual.carrinho, { ...item, quantidade: 1 }];
      return { ...estadoAtual, carrinho };
    });
    avisarItemAdicionado(item.nome);
  };

  const adicionarPizzaMeia = () => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "O sistema está fechado no momento!",
        tipo: "aviso",
      });
      return;
    }
    const saborA = pizzas.find((pizza) => String(pizza.id) === meiaSaborA);
    const saborB = pizzas.find((pizza) => String(pizza.id) === meiaSaborB);

    if (!saborA || !saborB) {
      setAlerta({
        titulo: "Atenção",
        mensagem: "Escolha os dois sabores da pizza meia a meia.",
        tipo: "aviso",
      });
      return;
    }

    if (esgotados.includes(saborA.id) || esgotados.includes(saborB.id)) {
      setAlerta({
        titulo: "Sabor Esgotado",
        mensagem: "Aviso: Um dos sabores escolhidos está ESGOTADO!",
        tipo: "erro",
      });
      return;
    }

    const overrideA = menuOverrides[String(saborA.id)] || {};
    const overrideB = menuOverrides[String(saborB.id)] || {};

    const precoA = overrideA.prices?.[meiaTamanho] !== undefined ? overrideA.prices[meiaTamanho] : saborA.prices[meiaTamanho];
    const precoB = overrideB.prices?.[meiaTamanho] !== undefined ? overrideB.prices[meiaTamanho] : saborB.prices[meiaTamanho];

    adicionarItem({
      key: `pizza-meia-${meiaTamanho}-${saborA.id}-${saborB.id}`,
      id: saborA.id,
      nome: `Pizza meia ${saborA.name} / ${saborB.name}`,
      categoria: "pizza",
      tamanho: meiaTamanho,
      precoUnitario: Math.max(precoA, precoB),
      meia: { saborA: saborA.name, saborB: saborB.name },
    });
  };

  const adicionarComboPromocional = () => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "O sistema está fechado no momento!",
        tipo: "aviso",
      });
      return;
    }
    const saborA = pizzas.find((pizza) => String(pizza.id) === comboSaborA);
    const saborB = pizzas.find((pizza) => String(pizza.id) === comboSaborB);

    if (!saborA || !saborB) {
      setAlerta({
        titulo: "Atenção",
        mensagem: "Escolha os dois sabores para o combo.",
        tipo: "aviso",
      });
      return;
    }

    if (esgotados.includes(saborA.id) || esgotados.includes(saborB.id)) {
      setAlerta({
        titulo: "Sabor Esgotado",
        mensagem: "Um dos sabores escolhidos para o combo está ESGOTADO!",
        tipo: "erro",
      });
      return;
    }

    adicionarItem({
      key: `combo-70-${saborA.id}-${saborB.id}`,
      id: 999, // ID Fixo para combos
      nome: `Combo 2 Pizzas (G): ${saborA.name} / ${saborB.name}`,
      categoria: "pizza",
      precoUnitario: 70,
    });
  };

  const alterarQuantidade = (key: string, delta: number) => {
    if (!lojaAberta) return;
    setPedido((estadoAtual) => ({
      ...estadoAtual,
      carrinho: estadoAtual.carrinho
        .map((item) => (item.key === key ? { ...item, quantidade: item.quantidade + delta } : item))
        .filter((item) => item.quantidade > 0),
    }));
  };

  const removerItem = (key: string) => {
    setPedido((estadoAtual) => ({
      ...estadoAtual,
      carrinho: estadoAtual.carrinho.filter((item) => item.key !== key),
    }));
  };

  const limparPedido = () => {
    setConfirmarAcao({
      mensagem: "Deseja realmente limpar a comanda inteira?",
      onConfirm: () => {
        setPedido({
          nomeGarcom: "",
          numeroMesa: "",
          observacoes: "",
          carrinho: [],
        });
        setModalCarrinhoAberto(false);
      },
    });
  };

  // ENVIAR PEDIDO PARA O FIREBASE (CAIXA)
  const enviarPedido = async () => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "A loja está fechada. Não é possível enviar comandos.",
        tipo: "aviso",
      });
      return;
    }
    if (!pedido.nomeGarcom.trim()) {
      setAlerta({ titulo: "Atenção", mensagem: "Informe o nome do garçom.", tipo: "aviso" });
      return;
    }

    if (!pedido.numeroMesa.trim()) {
      setAlerta({ titulo: "Atenção", mensagem: "Informe o número da mesa.", tipo: "aviso" });
      return;
    }

    if (pedido.carrinho.length === 0 && !pedido.observacoes.trim()) {
      setAlerta({
        titulo: "Atenção",
        mensagem: "Adicione itens ou uma observação para enviar.",
        tipo: "aviso",
      });
      return;
    }

    if (pedido.carrinho.length === 0 && !isMesaAberta) {
      setAlerta({
        titulo: "Atenção",
        mensagem: "Um novo pedido precisa ter pelo menos um item.",
        tipo: "aviso",
      });
      return;
    }

    let mesaFinal = pedido.numeroMesa.trim();
    if (/^\d+$/.test(mesaFinal)) {
      mesaFinal = parseInt(mesaFinal, 10).toString();
    }

    let origemPedido = isBalcao ? "BALCÃO" : `MESA ${mesaFinal}`;
    if (isMesaAberta) {
      origemPedido = tipoComplemento === "acrescimo"
        ? `ACRÉSCIMO - MESA ${mesaFinal}`
        : `CORREÇÃO/RETIRADA - MESA ${mesaFinal}`;
    }

    const pedidoMesa: PedidoMesa = {
      id: gerarIdPedido(),
      data: new Date().toISOString(),
      origem: origemPedido,
      garcom: pedido.nomeGarcom.trim(),
      mesa: mesaFinal,
      pagamento: "A DEFINIR NO CAIXA",
      itens: pedido.carrinho,
      subtotal,
      taxaEntrega: 0,
      taxaServico: 0,
      total,
      impresso: false,
      observacoes: pedido.observacoes.trim(),
    };

    try {
      await setDoc(doc(db, "pedidos", pedidoMesa.id), pedidoMesa);
      localStorage.removeItem(GARCOM_DRAFT_KEY);
      setPedido({
        nomeGarcom: pedido.nomeGarcom, // Mantém o nome do garçom para facilitar
        numeroMesa: "",
        observacoes: "",
        carrinho: [],
      });
      setModalCarrinhoAberto(false);
      setModalSucessoAberto(true);
    } catch (error) {
      console.error("Erro ao enviar comanda:", error);
      setAlerta({
        titulo: "Erro",
        mensagem: "Falha ao enviar a comanda. Verifique sua conexão com a internet.",
        tipo: "erro",
      });
    }
  };

  const conteudoCarrinho = (isModal: boolean) => (
    <section className={`flex flex-col border-primary bg-card overflow-hidden border-2 ${isModal ? "w-full max-w-lg max-h-[90vh] animate-in fade-in zoom-in-95 rounded-2xl shadow-2xl duration-200" : "rounded-2xl shadow-sm"}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 bg-primary px-5 py-4 text-primary-foreground">
        <h2 className="flex items-center gap-2 text-lg font-black uppercase">
          <ShoppingCart size={22} aria-hidden="true" />
          {isBalcao ? "Balcão" : `Mesa ${pedido.numeroMesa || "--"}`}
        </h2>
        <div className="flex items-center gap-3">
          <strong>{formatCurrency(total)}</strong>
          {isModal && (
            <button
              type="button"
              onClick={() => setModalCarrinhoAberto(false)}
              className="rounded-full p-1 hover:bg-primary-foreground/20 transition-colors"
            >
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      <div className={`p-3 sm:p-4 space-y-4 ${isModal ? "flex-1 overflow-y-auto" : ""}`}>
        <div>
          {pedido.carrinho.length === 0 ? (
            <div className={`grid place-items-center rounded-lg border border-dashed border-border bg-background px-6 text-center ${isModal ? "min-h-32" : "min-h-44"}`}>
              <p className="text-sm font-semibold text-muted-foreground">
                Nenhum item na comanda.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pedido.carrinho.map((item) => (
                <li
                  key={item.key}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-foreground">
                        {item.nome}
                        {item.tamanho && (
                          <span className="ml-2 text-primary">({item.tamanho})</span>
                        )}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {formatCurrency(item.precoUnitario)} cada
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removerItem(item.key)}
                      className="rounded-md p-1 text-destructive transition hover:bg-destructive/10"
                      aria-label={`Remover ${item.nome}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => alterarQuantidade(item.key, -1)}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-secondary font-black text-secondary-foreground transition hover:bg-primary hover:text-primary-foreground"
                        aria-label={`Diminuir ${item.nome}`}
                      >
                        <Minus size={16} aria-hidden="true" />
                      </button>
                      <span className="w-7 text-center text-sm font-black">
                        {item.quantidade}
                      </span>
                      <button
                        type="button"
                        onClick={() => alterarQuantidade(item.key, 1)}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
                        aria-label={`Aumentar ${item.nome}`}
                      >
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <strong className="text-sm font-black text-primary">
                      {formatCurrency(item.precoUnitario * item.quantidade)}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-bold text-foreground">Observações da mesa</span>
          <textarea
            value={pedido.observacoes}
            onChange={(event) =>
              setPedido((estadoAtual) => ({
                ...estadoAtual,
                observacoes: event.target.value,
              }))
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="Ex.: servir pratos antes, sem cebola"
          />
        </label>

        <div className="flex items-center justify-between rounded-lg bg-background border border-border p-3">
          <span className="text-sm font-black uppercase text-muted-foreground">Total</span>
          <span className="text-2xl font-black text-primary">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className={`border-t border-border bg-background p-4 ${isModal ? "shrink-0" : ""}`}>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={limparPedido}
            disabled={
              pedido.carrinho.length === 0 && !pedido.numeroMesa && !pedido.nomeGarcom
            }
            className="rounded-lg border border-border bg-background py-3 text-sm font-black uppercase text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={enviarPedido}
            disabled={pedido.carrinho.length === 0 && !pedido.observacoes.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-black uppercase text-primary-foreground shadow-[var(--shadow-warm)] transition hover:bg-[var(--brand-red-dark)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send size={17} aria-hidden="true" />
            Enviar
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <main className="min-h-screen bg-background pb-12 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Atendimento de mesa
            </p>
            <h1 className="text-2xl font-black text-primary">Painel do Garçom</h1>
            {!lojaAberta && (
              <div className="mt-2 inline-block rounded bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-md animate-pulse">
                ⚠️ Fechado no momento.
              </div>
            )}
          </div>
        </div>
      </header>

      {mensagemCarrinho && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-24 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-800 shadow-[var(--shadow-card)]"
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          {mensagemCarrinho}
        </div>
      )}

      {/* --- MODAL GLOBAL DE ALERTA --- */}
      {alerta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-card p-6 text-center shadow-2xl duration-200 border border-border">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${alerta.tipo === "erro" ? "bg-red-100 text-red-600" : alerta.tipo === "sucesso" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}
            >
              {alerta.tipo === "erro" || alerta.tipo === "aviso" ? (
                <AlertTriangle size={36} strokeWidth={2.5} />
              ) : (
                <CheckCircle2 size={36} strokeWidth={2.5} />
              )}
            </div>
            <h2 className="mb-2 text-2xl font-black text-foreground">{alerta.titulo}</h2>
            <p className="mb-6 font-semibold text-muted-foreground leading-relaxed">
              {alerta.mensagem}
            </p>
            <button
              onClick={() => setAlerta(null)}
              className="w-full rounded-xl bg-primary py-3 text-lg font-bold text-primary-foreground shadow-md transition hover:bg-primary/90 active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL DE CONFIRMAÇÃO --- */}
      {confirmarAcao && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-card p-6 text-center shadow-2xl duration-200 border border-border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <AlertTriangle size={36} strokeWidth={2.5} />
            </div>
            <h2 className="mb-2 text-2xl font-black text-foreground">Atenção</h2>
            <p className="mb-6 font-semibold text-muted-foreground leading-relaxed">
              {confirmarAcao.mensagem}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmarAcao(null)}
                className="flex-1 rounded-xl border border-border bg-background py-3 text-sm font-bold text-foreground transition hover:bg-muted active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  confirmarAcao.onConfirm();
                  setConfirmarAcao(null);
                }}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md transition hover:bg-[var(--brand-red-dark)] active:scale-95"
              >
                Sim, Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_390px]">
        <section
          className={`min-w-0 space-y-4 transition-all duration-300 ${!lojaAberta ? "pointer-events-none opacity-50 grayscale" : ""}`}
        >
          <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              <label className="flex-1 space-y-2">
                <span className="flex items-center gap-2 text-[10px] md:text-xs font-black uppercase text-muted-foreground">
                  <UserRound size={16} aria-hidden="true" />
                  Nome do Garçom
                </span>
                <input
                  value={pedido.nomeGarcom}
                  onChange={(event) =>
                    setPedido((estadoAtual) => ({
                      ...estadoAtual,
                      nomeGarcom: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm font-bold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-inner"
                  placeholder="Ex.: João"
                />
              </label>


              <div className="flex-1 space-y-2">
                <span className="text-[10px] md:text-xs font-black uppercase text-muted-foreground">Número da Mesa</span>
                <div className="flex gap-2">
                  <input
                    value={isBalcao ? "" : pedido.numeroMesa}
                    onChange={(event) =>
                      setPedido((estadoAtual) => ({
                        ...estadoAtual,
                        numeroMesa: event.target.value.replace(/\D/g, ""),
                      }))
                    }
                    disabled={isBalcao}
                    inputMode="numeric"
                    className="h-12 w-full rounded-xl border-2 border-primary/50 bg-background px-4 text-center text-xl font-black outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20 shadow-inner disabled:opacity-50 disabled:bg-muted"
                    placeholder={isBalcao ? "BALCÃO" : "00"}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPedido((estadoAtual) => ({
                        ...estadoAtual,
                        numeroMesa: isBalcao ? "" : "BALCÃO",
                      }))
                    }
                    className={`h-12 px-4 rounded-xl text-xs font-black uppercase transition-all border-2 ${isBalcao
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                  >
                    Balcão
                  </button>
                </div>
              </div>

            </div>

            {mesasAbertas.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border w-full min-w-0">
                <span className="text-[10px] font-black uppercase text-muted-foreground mb-3 block">Mesas em atendimento (Toque para adicionar itens):</span>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide w-full">
                  {mesasAbertas.map((m) => {
                    const isSelected = mesaInputNormalizada === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPedido(prev => ({ ...prev, numeroMesa: m }))}
                        className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all border ${isSelected
                          ? "bg-yellow-500 text-white border-yellow-600 shadow-md ring-2 ring-yellow-500/20"
                          : "bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100"
                          }`}
                      >
                        Mesa {m}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {isMesaAberta && (
              <div className="mt-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 sm:p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-yellow-500"></div>
                <p className="text-sm font-black text-yellow-700 flex items-center gap-2 mb-3">
                  <AlertTriangle size={18} />
                  Mesa {mesaInputNormalizada} já está aberta
                </p>
                <p className="text-xs text-yellow-700/80 mb-4 font-semibold">
                  Selecione se deseja adicionar novos itens ou retirar/corrigir algo do pedido atual.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 text-xs font-black uppercase px-4 py-3 rounded-xl cursor-pointer transition-all border ${tipoComplemento === 'acrescimo' ? 'bg-yellow-500 text-white border-yellow-600 shadow-md' : 'bg-background border-yellow-300 text-yellow-700 hover:bg-yellow-50'}`}>
                    <input
                      type="radio"
                      checked={tipoComplemento === "acrescimo"}
                      onChange={() => setTipoComplemento("acrescimo")}
                      className="sr-only"
                    />
                    <Plus size={16} /> Acréscimo de Itens
                  </label>
                  <label className={`flex-1 flex items-center justify-center gap-2 text-xs font-black uppercase px-4 py-3 rounded-xl cursor-pointer transition-all border ${tipoComplemento === 'correcao' ? 'bg-yellow-500 text-white border-yellow-600 shadow-md' : 'bg-background border-yellow-300 text-yellow-700 hover:bg-yellow-50'}`}>
                    <input
                      type="radio"
                      checked={tipoComplemento === "correcao"}
                      onChange={() => setTipoComplemento("correcao")}
                      className="sr-only"
                    />
                    <Minus size={16} /> Retirada / Correção
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* ÁREA DE ABAS E CARDÁPIO COMPLETO */}
          <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
            <div className="mb-6 flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-xl px-5 py-2.5 text-sm font-black uppercase transition-all ${tab === item.id
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                    : "bg-background text-muted-foreground border border-border hover:bg-muted"
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* ABA: PIZZAS */}
            {tab === "pizzas" && (
              <div className="grid gap-3">
                <div className="rounded-lg border-2 border-dashed border-primary/45 bg-background p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black text-foreground">Pizza meia a meia</h2>
                      <p className="text-sm font-medium text-muted-foreground">
                        O valor usa o maior preço entre os sabores escolhidos.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[120px_1fr_1fr_auto] items-center">
                    <select
                      value={meiaTamanho}
                      onChange={(event) => setMeiaTamanho(event.target.value as PizzaSize)}
                      className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-black outline-none focus:border-primary"
                    >
                      {tamanhosPizza.map((tamanho) => (
                        <option key={tamanho} value={tamanho}>
                          {tamanho}
                        </option>
                      ))}
                    </select>
                    <select
                      value={meiaSaborA}
                      onChange={(event) => setMeiaSaborA(event.target.value)}
                      className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                    >
                      {pizzas.map((pizza) => (
                        <option
                          key={pizza.id}
                          value={pizza.id}
                          disabled={esgotados.includes(pizza.id)}
                          className={esgotados.includes(pizza.id) ? "text-red-600 font-bold" : ""}
                        >
                          {pizza.name} {esgotados.includes(pizza.id) ? "(ESGOTADO)" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={meiaSaborB}
                      onChange={(event) => setMeiaSaborB(event.target.value)}
                      className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                    >
                      {pizzas.map((pizza) => (
                        <option
                          key={pizza.id}
                          value={pizza.id}
                          disabled={esgotados.includes(pizza.id)}
                          className={esgotados.includes(pizza.id) ? "text-red-600 font-bold" : ""}
                        >
                          {pizza.name} {esgotados.includes(pizza.id) ? "(ESGOTADO)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={adicionarPizzaMeia}
                      className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black uppercase text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
                    >
                      <Plus size={17} aria-hidden="true" />
                      Add
                    </button>
                  </div>
                </div>

                {pizzas.map((pizza) => {
                  const esgotado = esgotados.includes(pizza.id);
                  const override = menuOverrides[String(pizza.id)] || {};
                  const descricaoPizza = override.ingredientes !== undefined ? override.ingredientes : pizza.description;
                  return (
                    <article
                      key={pizza.id}
                      className={`relative flex flex-col justify-between p-4 rounded-xl border-2 transition-colors duration-200 shadow-sm ${esgotado ? "bg-red-50/50 border-red-200 pointer-events-none" : "bg-card border-border hover:border-primary/40"}`}
                    >
                      {esgotado && (
                        <div className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded-full shadow-sm flex items-center gap-1 z-10">
                          <Ban size={10} /> Esgotado
                        </div>
                      )}
                      <div className="mb-4 pr-20">
                        <h3 className={`text-lg font-black leading-tight ${esgotado ? 'text-red-900/60 line-through decoration-red-500/40' : 'text-foreground'}`}>
                          <span className="mr-2 text-primary">
                            {String(pizza.id).padStart(2, "0")}.
                          </span>
                          {pizza.name}
                        </h3>
                        {descricaoPizza && (
                          <p className="mt-1 text-sm font-medium text-muted-foreground">
                            {descricaoPizza}
                          </p>
                        )}
                        <div className="mt-2 space-y-1">
                          {pizza.highlight && (
                            <p className="text-xs font-black uppercase text-primary">
                              {pizza.highlight}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {tamanhosPizza.map((tamanho) => {
                          const precoTamanho = override.prices?.[tamanho] !== undefined ? override.prices[tamanho] : pizza.prices[tamanho];
                          return (
                            <button
                              key={tamanho}
                              type="button"
                              disabled={esgotado}
                              onClick={() =>
                                adicionarItem({
                                  key: `pizza-${pizza.id}-${tamanho}`,
                                  id: pizza.id,
                                  nome: `Pizza ${pizza.name}`,
                                  categoria: "pizza",
                                  tamanho,
                                  precoUnitario: precoTamanho,
                                })
                              }
                              className="rounded-lg border-2 border-secondary bg-card px-3 py-2 text-center transition hover:border-primary hover:bg-secondary"
                            >
                              <span className="block text-xs font-black text-primary">{tamanho}</span>
                              <span className="block text-sm font-black text-foreground">
                                {formatCurrency(precoTamanho)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {tab === "pizzas" && (
              <div className="mt-4 rounded-lg border-2 border-dashed border-amber-500/45 bg-amber-50/20 p-4">
                <div className="mb-3">
                  <h2 className="text-lg font-black text-amber-800">PROMOÇÃO: 2 PIZZAS (G) POR R$ 70,00</h2>
                  <p className="text-sm font-medium text-amber-700/80">
                    Escolha dois sabores (exceto Camarão e Atum).
                  </p>
                </div>

                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] items-center">
                  <select
                    value={comboSaborA}
                    onChange={(event) => setComboSaborA(event.target.value)}
                    className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                  >
                    {pizzas.filter(p => !p.name.toLowerCase().includes("camarão") && !p.name.toLowerCase().includes("atum")).map((pizza) => (
                      <option
                        key={pizza.id}
                        value={pizza.id}
                        disabled={esgotados.includes(pizza.id)}
                        className={esgotados.includes(pizza.id) ? "text-red-600 font-bold" : ""}
                      >
                        {pizza.name} {esgotados.includes(pizza.id) ? "(ESGOTADO)" : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    value={comboSaborB}
                    onChange={(event) => setComboSaborB(event.target.value)}
                    className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                  >
                    {pizzas.filter(p => !p.name.toLowerCase().includes("camarão") && !p.name.toLowerCase().includes("atum")).map((pizza) => (
                      <option key={pizza.id} value={pizza.id} disabled={esgotados.includes(pizza.id)} className={esgotados.includes(pizza.id) ? "text-red-600 font-bold" : ""}>
                        {pizza.name} {esgotados.includes(pizza.id) ? "(ESGOTADO)" : ""}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={adicionarComboPromocional} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-black uppercase text-white transition hover:bg-amber-600">
                    <Plus size={17} aria-hidden="true" /> Add Combo
                  </button>
                </div>
              </div>
            )}

            {/* DEMAIS ABAS (Pastéis, Porções, Bebidas, Sucos) */}
            {tab !== "pizzas" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {((tab === "pasteis"
                  ? pasteis
                  : tab === "porcoes"
                    ? porcoes
                    : tab === "bebidas"
                      ? bebidas
                      : sucos
                ) as any[]).map((item: any) => {
                  const esgotado = esgotados.includes(item.id);
                  const override = menuOverrides[String(item.id)] || {};
                  const descricaoItem = override.ingredientes !== undefined ? override.ingredientes : item.description;
                  const precoBase = override.preco !== undefined ? override.preco : item.price;

                  if (tab === "sucos") {
                    return (
                      <article
                        key={item.id}
                        className={`relative flex flex-col justify-between p-4 rounded-xl border-2 transition-colors duration-200 shadow-sm ${esgotado ? "bg-red-50/50 border-red-200 pointer-events-none" : "bg-card border-border hover:border-primary/40"}`}
                      >
                        {esgotado && (
                          <div className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded-full shadow-sm flex items-center gap-1 z-10">
                            <Ban size={10} /> Esgotado
                          </div>
                        )}
                        <div className="mb-4 pr-20">
                          <h3 className={`text-base font-black leading-tight ${esgotado ? 'text-red-900/60 line-through decoration-red-500/40' : 'text-foreground'}`}>
                            <span className="mr-2 text-primary">{item.id}.</span>
                            {item.name}
                          </h3>
                          <p className="text-xs font-semibold text-muted-foreground mt-1">
                            Ao leite tem acréscimo de {formatCurrency(SUCO_AO_LEITE_ACRESCIMO)}.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={esgotado}
                            onClick={() =>
                              adicionarItem({
                                key: `suco-${item.id}-natural`,
                                id: item.id,
                                nome: `Suco ${item.name}`,
                                categoria: "suco", // Corrigido para "suco"
                                precoUnitario: precoBase,
                              })
                            }
                            className="rounded-lg border border-secondary bg-card px-3 py-2 text-left transition hover:border-primary hover:bg-secondary"
                          >
                            <span className="block text-xs font-black uppercase text-muted-foreground">
                              Natural
                            </span>
                            <span className="block text-sm font-black text-foreground">
                              {formatCurrency(precoBase)}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={esgotado}
                            onClick={() =>
                              adicionarItem({
                                key: `suco-${item.id}-ao-leite`,
                                id: item.id,
                                nome: `Suco ${item.name} ao leite`,
                                categoria: "suco", // Corrigido para "suco"
                                precoUnitario: precoBase + SUCO_AO_LEITE_ACRESCIMO,
                              })
                            }
                            className="rounded-lg border border-primary bg-secondary px-3 py-2 text-left transition hover:border-primary hover:bg-[var(--brand-yellow-light)]"
                          >
                            <span className="block text-xs font-black uppercase text-primary">
                              Ao leite
                            </span>
                            <span className="block text-sm font-black text-foreground">
                              {formatCurrency(precoBase + SUCO_AO_LEITE_ACRESCIMO)}
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={esgotado}
                      onClick={() =>
                        adicionarItem({
                          key: `${tab}-${item.id}`,
                          id: item.id,
                          nome: item.name,
                          categoria:
                            tab === "pasteis" ? "pastel" : tab === "porcoes" ? "porcao" : "bebida",
                          precoUnitario: precoBase,
                        })
                      }
                      className={`relative flex items-center justify-between gap-4 p-4 rounded-xl border-2 text-left transition-colors duration-200 shadow-sm ${esgotado ? "bg-red-50/50 border-red-200 pointer-events-none" : "bg-card border-border hover:border-primary/40"}`}
                    >
                      {esgotado && (
                        <div className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded-full shadow-sm flex items-center gap-1 z-10">
                          <Ban size={10} /> Esgotado
                        </div>
                      )}
                      <span className="pr-16">
                        <span className={`block text-base font-black leading-tight ${esgotado ? 'text-red-900/60 line-through decoration-red-500/40' : 'text-foreground'}`}>
                          <span className="mr-2 text-primary">{item.id}.</span>
                          {item.name}
                        </span>
                        {descricaoItem && (
                          <span className="mt-1 block text-xs font-medium text-muted-foreground">
                            {descricaoItem}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 rounded-lg px-3 py-2 text-sm font-black ${esgotado ? "bg-red-100 text-red-800/50" : "bg-secondary text-secondary-foreground"}`}>
                        {formatCurrency(precoBase)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside
          className={`hidden lg:block lg:sticky lg:top-24 lg:self-start transition-all duration-300 ${!lojaAberta ? "pointer-events-none opacity-50 grayscale" : ""}`}
        >
          {conteudoCarrinho(false)}
        </aside>
      </div>

      {/* MODAL DO CARRINHO (Apenas Mobile) */}
      {modalCarrinhoAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity lg:hidden">
          {conteudoCarrinho(true)}
        </div>
      )}

      {modalSucessoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-card p-6 text-center shadow-2xl duration-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 size={36} strokeWidth={2.5} />
            </div>

            <h2 className="mb-2 text-2xl font-black text-foreground">
              {isBalcao ? "Pedido de Balcão Enviado!" : `Mesa ${pedido.numeroMesa} Enviada!`}
            </h2>
            <p className="mb-6 font-semibold text-muted-foreground">
              A comanda foi encaminhada para o caixa com sucesso.
            </p>

            <button
              type="button"
              onClick={() => setModalSucessoAberto(false)}
              className="w-full rounded-xl bg-primary py-3 text-lg font-bold text-primary-foreground shadow-md transition hover:bg-[var(--brand-red-dark)] active:scale-95"
            >
              Fazer novo pedido
            </button>
          </div>
        </div>
      )}

      {/* BOTÃO FLUTUANTE DO CARRINHO (Apenas Mobile/Tablets) */}
      {(pedido.carrinho.length > 0 || pedido.observacoes.trim().length > 0) && (
        <button
          type="button"
          onClick={() => setModalCarrinhoAberto(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-primary px-5 py-3.5 font-black text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.3)] transition-transform hover:scale-105 active:scale-95 border-2 border-primary-foreground/20 lg:hidden"
        >
          <div className="relative flex items-center">
            <ShoppingCart size={24} />
            <span className="absolute -right-2.5 -top-2.5 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-background text-[11px] text-primary shadow-sm border border-border">
              {pedido.carrinho.reduce((totalItens, item) => totalItens + item.quantidade, 0)}
            </span>
          </div>
          <span className="flex flex-col text-left border-l border-primary-foreground/30 pl-3 ml-1">
            <span className="text-[10px] uppercase tracking-wider leading-none opacity-90 mb-1">Ver Comanda</span>
            <span className="text-sm leading-none">{formatCurrency(total)}</span>
          </span>
        </button>
      )}
    </main>
  );
}
