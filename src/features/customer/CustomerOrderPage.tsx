import { useEffect, useMemo, useRef, useState } from "react";
import logo from "@/assets/logo.jpeg";
import { bebidas, pasteis, pizzas, porcoes, sucos, type PizzaSize } from "@/domain/menu/menu";
import { formatCurrency } from "@/shared/utils/format";
import {
  Bike,
  CheckCircle2,
  Copy,
  CreditCard,
  MapPin,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  ShoppingCart,
  Store,
  Trash2,
  UserRound,
  AlertTriangle,
  X,
  Ban,
} from "lucide-react";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";

type Categoria = "pizzas" | "pasteis" | "porcoes" | "bebidas" | "sucos";
type TipoEntrega = "NO_LOCAL" | "RETIRAR" | "ENTREGAR";
type FormaPagamento = "PIX" | "Crédito" | "Débito" | "Dinheiro";

export interface ItemCarrinho {
  key: string;
  id: number;
  nome: string;
  categoria: Categoria;
  precoUnitario: number;
  quantidade: number;
  tamanho?: PizzaSize;
  meia?: {
    saborA: string;
    saborB: string;
  };
}

export interface Pedido {
  id: string;
  data: string;
  origem: string;
  cliente: {
    nome: string;
    endereco: string;
    telefone: string;
  };
  tipoEntrega: TipoEntrega;
  pagamento: FormaPagamento;
  itens: ItemCarrinho[];
  subtotal: number;
  taxaEntrega: number;
  total: number;
  impresso: boolean;
  observacoes?: string;
  status?: string;
}

const CLIENT_DRAFT_KEY = "cliente-carrinho-rascunho";
const PIX_KEY = "460c389b-9041-4124-884f-01fef2e316e6";
const CASHIER_WHATSAPP = "5584998135262";
const SUCO_AO_LEITE_ACRESCIMO = 1;
const tamanhosPizza: PizzaSize[] = ["M", "G", "GG"];

const tabs: { id: Categoria; label: string }[] = [
  { id: "pizzas", label: "Pizzas" },
  { id: "pasteis", label: "Pastéis" },
  { id: "porcoes", label: "Porções" },
  { id: "bebidas", label: "Bebidas" },
  { id: "sucos", label: "Sucos" },
];

const opcoesEntrega: {
  value: TipoEntrega;
  label: string;
  detalhe: string;
  taxa: number;
  icon: React.ElementType;
}[] = [
    { value: "NO_LOCAL", label: "No Local", detalhe: "Grátis", taxa: 0, icon: Store },
    { value: "RETIRAR", label: "Retirar", detalhe: "Grátis", taxa: 0, icon: PackageCheck },
    { value: "ENTREGAR", label: "Entregar", detalhe: "+ R$ 5,00", taxa: 5, icon: Bike },
  ];

const formasPagamento: FormaPagamento[] = ["PIX", "Crédito", "Débito", "Dinheiro"];

interface ClienteDraft {
  tab: Categoria;
  carrinho: ItemCarrinho[];
  nome: string;
  telefone: string;
  endereco: string;
  observacoes: string;
  tipoEntrega: TipoEntrega;
  formaPagamento: FormaPagamento;
  meiaTamanho: PizzaSize;
  meiaSaborA: string;
  meiaSaborB: string;
}

const clienteDraftDefault: ClienteDraft = {
  tab: "pizzas",
  carrinho: [],
  nome: "",
  telefone: "",
  endereco: "",
  observacoes: "",
  tipoEntrega: "NO_LOCAL",
  formaPagamento: "PIX",
  meiaTamanho: "G",
  meiaSaborA: String(pizzas[0]?.id ?? ""),
  meiaSaborB: String(pizzas[1]?.id ?? ""),
};

const lerClienteDraft = (): ClienteDraft => {
  const raw = localStorage.getItem(CLIENT_DRAFT_KEY);
  if (!raw) return clienteDraftDefault;

  try {
    const parsed = JSON.parse(raw) as Partial<ClienteDraft>;
    return {
      ...clienteDraftDefault,
      ...parsed,
      carrinho: Array.isArray(parsed.carrinho) ? parsed.carrinho : [],
    };
  } catch {
    return clienteDraftDefault;
  }
};

const gerarIdPedido = () =>
  globalThis.crypto?.randomUUID?.() ?? `PED-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export function CustomerOrderPage() {
  const [rascunhoInicial] = useState(() => lerClienteDraft());
  const [tab, setTab] = useState<Categoria>(rascunhoInicial.tab);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>(rascunhoInicial.carrinho);
  const [nome, setNome] = useState(rascunhoInicial.nome);
  const [telefone, setTelefone] = useState(rascunhoInicial.telefone);
  const [endereco, setEndereco] = useState(rascunhoInicial.endereco);
  const [observacoes, setObservacoes] = useState(rascunhoInicial.observacoes);
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>(rascunhoInicial.tipoEntrega);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(
    rascunhoInicial.formaPagamento,
  );
  const [meiaTamanho, setMeiaTamanho] = useState<PizzaSize>(rascunhoInicial.meiaTamanho);
  const [meiaSaborA, setMeiaSaborA] = useState(rascunhoInicial.meiaSaborA);
  const [meiaSaborB, setMeiaSaborB] = useState(rascunhoInicial.meiaSaborB);
  const [mensagemCarrinho, setMensagemCarrinho] = useState("");
  const [modalSucessoAberto, setModalSucessoAberto] = useState(false);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // ESTADO DA LOJA E ESTOQUE
  const [lojaAberta, setLojaAberta] = useState(true);
  const [horarioFuncionamento, setHorarioFuncionamento] = useState(
    "🕒Quarta a Domingo | das 18h às 22h.",
  );
  const [esgotados, setEsgotados] = useState<number[]>([]);
  const [menuOverrides, setMenuOverrides] = useState<Record<string, any>>({});

  // ESTADO DE ALERTA GLOBAL
  const [alerta, setAlerta] = useState<{
    titulo: string;
    mensagem: string;
    tipo: "sucesso" | "erro" | "aviso";
  } | null>(null);

  const mensagemTimeoutRef = useRef<number | null>(null);

  // CÁLCULO DINÂMICO DOS 2 PASTÉIS
  // 👇 CÁLCULO DINÂMICO INTELIGENTE DOS 2 PASTÉIS 👇
  const valorMinimoEntrega = useMemo(() => {
    if (!pasteis || pasteis.length === 0) return 20; // Garantia contra falhas

    let precoBase = Number(pasteis[0].price);

    // 1. Vasculha TODOS os pastéis em busca dos valores que você editou no Caixa
    const precosEditados = pasteis
      .map(pastel => menuOverrides[String(pastel.id)]?.preco)
      .filter(preco => preco !== undefined && Number(preco) > 0)
      .map(Number);

    // 2. Se o sistema achou algum pastel atualizado (ex: 15 reais), usa ele como a nova regra
    if (precosEditados.length > 0) {
      // Pega o maior preço editado para garantir que a entrega sempre cubra a viagem
      precoBase = Math.max(...precosEditados);
    }

    // 3. Multiplica o valor atualizado por 2
    return precoBase * 2;
  }, [menuOverrides]);
  // 👆 FIM DO CÁLCULO DINÂMICO 👆

  const subtotal = useMemo(
    () => carrinho.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0),
    [carrinho],
  );

  const taxaEntrega = opcoesEntrega.find((opcao) => opcao.value === tipoEntrega)?.taxa ?? 0;
  const total = subtotal + taxaEntrega;
  const enderecoObrigatorio = tipoEntrega === "ENTREGAR";

  const atendeValorMinimoEntrega = !enderecoObrigatorio || subtotal >= valorMinimoEntrega;

  const dadosConferenciaOk =
    carrinho.length > 0 &&
    nome.trim().length > 0 &&
    (tipoEntrega === "NO_LOCAL" || telefone.replace(/\D/g, "").length >= 10) &&
    (!enderecoObrigatorio || endereco.trim().length > 0) &&
    (formaPagamento !== "Dinheiro" || observacoes.trim().length > 0) &&
    atendeValorMinimoEntrega;

  useEffect(() => {
    const draft: ClienteDraft = {
      tab,
      carrinho,
      nome,
      telefone,
      endereco,
      observacoes,
      tipoEntrega,
      formaPagamento,
      meiaTamanho,
      meiaSaborA,
      meiaSaborB,
    };
    localStorage.setItem(CLIENT_DRAFT_KEY, JSON.stringify(draft));
  }, [
    carrinho,
    endereco,
    telefone,
    formaPagamento,
    meiaSaborA,
    meiaSaborB,
    meiaTamanho,
    nome,
    observacoes,
    tab,
    tipoEntrega,
  ]);

  // ESPIÃO DA LOJA ABERTA/FECHADA E CARDÁPIO
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

  const mostrarMensagem = (mensagem: string) => {
    setMensagemCarrinho(mensagem);
    if (mensagemTimeoutRef.current) window.clearTimeout(mensagemTimeoutRef.current);
    mensagemTimeoutRef.current = window.setTimeout(() => {
      setMensagemCarrinho("");
      mensagemTimeoutRef.current = null;
    }, 1800);
  };

  const avisarItemAdicionado = (nomeItem: string) => {
    mostrarMensagem(`${nomeItem} adicionado ao carrinho.`);
  };

  const itensResumoWhatsApp = useMemo(() => {
    if (carrinho.length === 0) return "Nenhum item informado";
    return carrinho
      .map(
        (item) =>
          `${item.quantidade}x ${item.nome}${item.tamanho ? ` (${item.tamanho})` : ""} - ${formatCurrency(item.precoUnitario * item.quantidade)}`,
      )
      .join("\n");
  }, [carrinho]);

  const mensagemWhatsApp = useMemo(() => {
    const entregaSelecionada =
      opcoesEntrega.find((opcao) => opcao.value === tipoEntrega)?.label ?? "Não informado";
    return [
      "Olá, caixa da Pizzaria 2 Irmãos!",
      "Segue meu comprovante de PIX para conferência do pedido.",
      "",
      `Cliente: ${nome.trim() || "Não informado"}`,
      `WhatsApp: ${telefone.trim() || "Não informado"}`,
      `Entrega: ${entregaSelecionada}`,
      `Endereço: ${endereco.trim() || "Não informado"}`,
      `Pagamento: PIX`,
      `Subtotal: ${formatCurrency(subtotal)}`,
      `Taxa de entrega: ${formatCurrency(taxaEntrega)}`,
      `Total pago: ${formatCurrency(total)}`,
      "",
      "Itens do pedido:",
      itensResumoWhatsApp,
      observacoes.trim() ? `\nObservações: ${observacoes.trim()}` : "",
      "",
      `Por favor, confirme que o cliente ${nome.trim() || "informado acima"} pagou e pode preparar o pedido dele.`,
    ]
      .filter(Boolean)
      .join("\n");
  }, [endereco, telefone, itensResumoWhatsApp, nome, observacoes, subtotal, taxaEntrega, tipoEntrega, total]);

  const whatsappLink = `https://wa.me/${CASHIER_WHATSAPP}?text=${encodeURIComponent(mensagemWhatsApp)}`;

  const copiarPix = () => {
    if (!("clipboard" in navigator)) {
      setAlerta({
        titulo: "Aviso",
        mensagem: `Não foi possível copiar automaticamente. Chave PIX: ${PIX_KEY}`,
        tipo: "aviso",
      });
      return;
    }
    void navigator.clipboard
      .writeText(PIX_KEY)
      .then(() => mostrarMensagem("Chave PIX copiada."))
      .catch(() =>
        setAlerta({
          titulo: "Aviso",
          mensagem: `Não foi possível copiar automaticamente. Chave PIX: ${PIX_KEY}`,
          tipo: "aviso",
        }),
      );
  };

  const abrirWhatsAppComprovante = () => {
    if (enderecoObrigatorio && subtotal < valorMinimoEntrega) {
      setAlerta({
        titulo: "Pedido Mínimo",
        mensagem: "O pedido mínimo para entrega é o equivalente a 2 pastéis. Adicione mais algum item ao carrinho!",
        tipo: "aviso",
      });
      return;
    }

    if (!dadosConferenciaOk) {
      setAlerta({
        titulo: "Atenção",
        mensagem:
          "Preencha nome, WhatsApp válido e endereço (se for entrega) antes de enviar o comprovante.",
        tipo: "erro",
      });
      return;
    }
    window.open(whatsappLink, "_blank", "noopener,noreferrer");
  };

  // PROTEÇÃO CONTRA CLIQUES SE ESTIVER FECHADO OU ESGOTADO
  const adicionarItem = (item: Omit<ItemCarrinho, "quantidade">) => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "Estamos fechados no momento! Abriremos às 18:00h.",
        tipo: "aviso",
      });
      return;
    }
    if (esgotados.includes(item.id)) {
      setAlerta({
        titulo: "Item Esgotado",
        mensagem: "Desculpe, este produto esgotou hoje!",
        tipo: "erro",
      });
      return;
    }

    setCarrinho((itensAtuais) => {
      const existente = itensAtuais.find((itemAtual) => itemAtual.key === item.key);
      if (!existente) return [...itensAtuais, { ...item, quantidade: 1 }];
      return itensAtuais.map((itemAtual) =>
        itemAtual.key === item.key
          ? { ...itemAtual, quantidade: itemAtual.quantidade + 1 }
          : itemAtual,
      );
    });
    avisarItemAdicionado(item.nome);
  };

  const alterarQuantidade = (key: string, delta: number) => {
    if (!lojaAberta) return;
    setCarrinho((itensAtuais) =>
      itensAtuais
        .map((item) => (item.key === key ? { ...item, quantidade: item.quantidade + delta } : item))
        .filter((item) => item.quantidade > 0),
    );
  };

  const removerItem = (key: string) => {
    setCarrinho((itensAtuais) => itensAtuais.filter((item) => item.key !== key));
  };

  const adicionarPizzaMeia = () => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "Estamos fechados no momento! Abriremos às 18:00h.",
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
        mensagem: "Um dos sabores escolhidos acabou no estoque!",
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
      categoria: "pizzas",
      tamanho: meiaTamanho,
      precoUnitario: Math.max(precoA, precoB),
      meia: { saborA: saborA.name, saborB: saborB.name },
    });
  };

  const lidarComMudancaTelefone = (event: React.ChangeEvent<HTMLInputElement>) => {
    const valorDigitado = event.target.value;
    const apenasNumeros = valorDigitado.replace(/\D/g, "");

    // Se ele tentar digitar o 12º número, a tela apita o erro na hora e trava o teclado!
    if (apenasNumeros.length > 11) {
      setAlerta({
        titulo: "Limite de Números",
        mensagem: "O WhatsApp não pode ter mais de 11 números (DDD + 9 dígitos). Verifique se digitou algum número a mais por engano.",
        tipo: "erro",
      });
      return;
    }

    // Se estiver no tamanho certo, atualiza o texto na tela
    setTelefone(valorDigitado);
  };

  const conteudoCarrinho = (isModal: boolean) => (
    <section className={`flex flex-col border-primary bg-card overflow-hidden border-2 ${isModal ? "w-full max-w-lg max-h-[90vh] animate-in fade-in zoom-in-95 rounded-2xl shadow-2xl duration-200" : "rounded-xl shadow-[var(--shadow-warm)]"}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <h2 className="flex items-center gap-2 text-lg font-black uppercase">
          <ShoppingCart size={20} aria-hidden="true" />
          Carrinho
        </h2>
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-primary-foreground/15 px-3 py-1 text-sm font-black">
            {carrinho.reduce((totalItens, item) => totalItens + item.quantidade, 0)} itens
          </span>
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
          {carrinho.length === 0 ? (
            <div className={`grid place-items-center rounded-lg border border-dashed border-border bg-background px-6 text-center ${isModal ? "min-h-32" : "min-h-44"}`}>
              <p className="text-sm font-semibold text-muted-foreground">
                Seu carrinho está vazio.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {carrinho.map((item) => (
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
          <span className="text-sm font-bold text-foreground">Observações</span>
          <textarea
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="Ex.: sem cebola, pouco orégano, troco para R$ 100"
          />
        </label>

        {formaPagamento === "PIX" && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-950">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase text-green-800">Pagamento PIX</p>
                <p className="text-xs font-semibold text-green-700">
                  Copie a chave e envie o comprovante para o caixa conferir.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-white p-2">
              <code className="flex-1 break-all text-sm font-black text-green-900">
                {PIX_KEY}
              </code>
              <button
                type="button"
                onClick={copiarPix}
                className="flex h-9 items-center gap-2 rounded-lg bg-green-700 px-3 text-xs font-black uppercase text-white transition hover:bg-green-800"
              >
                <Copy size={15} aria-hidden="true" />
                Copiar
              </button>
            </div>

            <button
              type="button"
              onClick={abrirWhatsAppComprovante}
              disabled={enderecoObrigatorio && !atendeValorMinimoEntrega}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 text-sm font-black uppercase text-white transition hover:bg-[#1fb458] disabled:cursor-not-allowed disabled:opacity-45 grayscale-0 disabled:grayscale"
            >
              <MessageCircle size={17} aria-hidden="true" />
              Enviar comprovante
            </button>
          </div>
        )}

        {formaPagamento === "Dinheiro" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-amber-600">
                <AlertTriangle size={18} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-black uppercase text-amber-800">Pagamento em Dinheiro</p>
                <p className="text-xs font-semibold text-amber-700">
                  Por favor, informe nas <strong>Observações</strong> acima se você vai precisar de troco (e para quanto).
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-lg bg-background border border-border p-3">
          <div className="flex justify-between text-sm font-bold text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-muted-foreground">
            <span>Entrega</span>
            <span>{formatCurrency(taxaEntrega)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-xl font-black text-primary">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
        {/* 👇 AVISO DOS 2 PASTÉIS 👇 */}
        {enderecoObrigatorio && !atendeValorMinimoEntrega && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-950">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-blue-600">
                <AlertTriangle size={18} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-black uppercase text-blue-800">Pedido Mínimo</p>
                <p className="text-xs font-semibold text-blue-700">Para entregas, o pedido mínimo é o equivalente a <strong>2 pastéis</strong>.</p>
              </div>
            </div>
          </div>
        )}
        {/* 👆 FIM DO AVISO 👆 */}
      </div>


      <div className={`border-t border-border bg-background p-4 ${isModal ? "shrink-0" : ""}`}>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setCarrinho([])}
            disabled={carrinho.length === 0}
            className="rounded-lg border border-border bg-background py-3 text-sm font-black uppercase text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={finalizarPedido}
            disabled={!dadosConferenciaOk || !lojaAberta}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-black uppercase text-primary-foreground shadow-[var(--shadow-warm)] transition hover:bg-[var(--brand-red-dark)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ReceiptText size={17} aria-hidden="true" />
            {lojaAberta ? "Finalizar" : "Fechado"}
          </button>
        </div>
      </div>
    </section>
  );

  const finalizarPedido = async () => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "A loja está fechada. Volte mais tarde!",
        tipo: "aviso",
      });
      return;
    }
    if (carrinho.length === 0) {
      setAlerta({
        titulo: "Carrinho Vazio",
        mensagem: "Adicione pelo menos um item ao carrinho.",
        tipo: "aviso",
      });
      return;
    }
    if (enderecoObrigatorio && !atendeValorMinimoEntrega) {
      setAlerta({
        titulo: "Pedido Mínimo",
        mensagem: "O pedido mínimo para entrega é o equivalente a 2 pastéis. Por favor, adicione mais itens ao seu carrinho.",
        tipo: "aviso",
      });
      return;
    }
    const numerosTelefone = telefone.replace(/\D/g, "");
    if (tipoEntrega !== "NO_LOCAL" && numerosTelefone.length > 11) {
      setAlerta({
        titulo: "WhatsApp Inválido",
        mensagem: "Você digitou números a mais no WhatsApp. O formato correto é o DDD + 9 dígitos.",
        tipo: "erro",
      });
      return;
    }

    if (!dadosConferenciaOk) {
      if (formaPagamento === "Dinheiro" && observacoes.trim().length === 0) {
        setAlerta({
          titulo: "Precisa de Troco?",
          mensagem: "Como o pagamento será em dinheiro, por favor informe nas observações se você vai precisar de troco (e para quanto).",
          tipo: "aviso",
        });
        return;
      }

      setAlerta({
        titulo: "Dados Incompletos",
        mensagem: "Preencha os dados de contato corretamente antes de finalizar o pedido.",
        tipo: "erro",
      });
      return;
    }

    const entregaSelecionada = opcoesEntrega.find((opcao) => opcao.value === tipoEntrega);
    const pedido: Pedido = {
      id: gerarIdPedido(),
      data: new Date().toISOString(),
      origem: entregaSelecionada?.label ?? "Cliente",
      cliente: {
        nome: nome.trim(),
        endereco: endereco.trim(),
        telefone: tipoEntrega !== "NO_LOCAL" ? telefone.replace(/\D/g, "").slice(0, 11) : ""
      },
      tipoEntrega,
      pagamento: formaPagamento,
      itens: carrinho,
      subtotal,
      taxaEntrega,
      total,
      impresso: false,
      observacoes: observacoes.trim(),
    };

    setEnviando(true);

    try {
      await setDoc(doc(db, "pedidos", pedido.id), pedido);
      localStorage.removeItem(CLIENT_DRAFT_KEY);
      setCarrinho([]);
      setObservacoes("");
      setModalCarrinhoAberto(false);
      setModalSucessoAberto(true);
    } catch (error) {
      console.error("Erro ao salvar pedido:", error);
      setAlerta({
        titulo: "Falha na Conexão",
        mensagem: "Falha ao enviar o pedido. Verifique sua conexão com a internet.",
        tipo: "erro",
      });
    } finally {
      setEnviando(false); // 👇 DESTRAVA AQUI
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <img
            src={logo}
            alt="Pizzaria 2 Irmãos"
            className={`h-14 w-14 rounded-lg object-cover ring-2 ring-secondary ${!lojaAberta ? "grayscale" : ""}`}
          />
          <div className="flex-1">
            <h1 className="text-2xl font-black uppercase text-primary md:text-3xl">
              Pizzaria 2 Irmãos
            </h1>
            <p className="text-sm font-semibold text-muted-foreground">
              Cardápio Digital - {horarioFuncionamento} Faça seu pedido e retire ou receba em casa!
            </p>
            {!lojaAberta && (
              <div className="mt-2 inline-block rounded bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-md animate-pulse">
                ⚠️ Fechado no momento. Abrimos às 18:00h!
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

      {/* MODAL GLOBAL DE ALERTA */}
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

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_400px]">
        <main
          className={`space-y-5 transition-all duration-300 ${!lojaAberta ? "pointer-events-none opacity-50 grayscale" : ""}`}
        >
          <section className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <UserRound size={16} aria-hidden="true" />
                  Nome
                </span>
                <input
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="Seu nome"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <MessageCircle size={16} aria-hidden="true" />
                  WhatsApp
                </span>
                <input
                  type="tel"
                  value={telefone}
                  onChange={lidarComMudancaTelefone}
                  disabled={tipoEntrega === "NO_LOCAL"}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
                  placeholder="(DDD) 99999-9999"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <MapPin size={16} aria-hidden="true" />
                  Endereço
                </span>
                <input
                  value={endereco}
                  onChange={(event) => setEndereco(event.target.value)}
                  disabled={tipoEntrega === "NO_LOCAL"}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
                  placeholder="Rua, número, bairro"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <CreditCard size={16} aria-hidden="true" />
                  Pagamento
                </span>
                <select
                  value={formaPagamento}
                  onChange={(event) => setFormaPagamento(event.target.value as FormaPagamento)}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  {formasPagamento.map((forma) => (
                    <option key={forma} value={forma}>
                      {forma}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {opcoesEntrega.map((opcao) => {
                const Icon = opcao.icon;
                const selecionado = tipoEntrega === opcao.value;

                return (
                  <button
                    key={opcao.value}
                    type="button"
                    onClick={() => setTipoEntrega(opcao.value)}
                    className={`flex items-center justify-between rounded-lg border-2 p-3 text-left transition ${selecionado
                      ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-warm)]"
                      : "border-border bg-background text-foreground hover:border-primary"
                      }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={20} aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-black">{opcao.label}</span>
                        <span
                          className={`block text-xs font-semibold ${selecionado ? "text-primary-foreground/85" : "text-muted-foreground"
                            }`}
                        >
                          {opcao.detalhe}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-black uppercase transition ${tab === item.id
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-warm)]"
                    : "bg-background text-foreground hover:bg-secondary"
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

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

                {pizzas.map((pizza: any) => {
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
                        {pizza.highlight && (
                          <p className="mt-2 text-xs font-black uppercase text-primary">
                            {pizza.highlight}
                          </p>
                        )}
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
                                  categoria: "pizzas",
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
                  const descricaoItem = override.ingredientes !== undefined ? override.ingredientes : (item as any).description;
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
                                key: `sucos-${item.id}-natural`,
                                id: item.id,
                                nome: `Suco ${item.name}`,
                                categoria: "sucos",
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
                                key: `sucos-${item.id}-ao-leite`,
                                id: item.id,
                                nome: `Suco ${item.name} ao leite`,
                                categoria: "sucos",
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
                          categoria: tab,
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
          </section>
        </main>

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

            <h2 className="mb-2 text-2xl font-black text-foreground">Pedido Enviado!</h2>
            <p className="mb-6 font-semibold text-muted-foreground">
              Seu pedido foi encaminhado para o caixa com sucesso.
            </p>

            <button
              type="button"
              onClick={() => setModalSucessoAberto(false)}
              className="w-full rounded-xl bg-primary py-3 text-lg font-bold text-primary-foreground shadow-md transition hover:bg-[var(--brand-red-dark)] active:scale-95"
            >
              Fechar e Voltar
            </button>
          </div>
        </div>
      )}

      {/* BOTÃO FLUTUANTE DO CARRINHO (Apenas Mobile/Tablets) */}
      {carrinho.length > 0 && (
        <button
          type="button"
          onClick={() => setModalCarrinhoAberto(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-primary px-5 py-3.5 font-black text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.3)] transition-transform hover:scale-105 active:scale-95 border-2 border-primary-foreground/20 lg:hidden"
        >
          <div className="relative flex items-center">
            <ShoppingCart size={24} />
            <span className="absolute -right-2.5 -top-2.5 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-background text-[11px] text-primary shadow-sm border border-border">
              {carrinho.reduce((totalItens, item) => totalItens + item.quantidade, 0)}
            </span>
          </div>
          <span className="flex flex-col text-left border-l border-primary-foreground/30 pl-3 ml-1">
            <span className="text-[10px] uppercase tracking-wider leading-none opacity-90 mb-1">Ver Carrinho</span>
            <span className="text-sm leading-none">{formatCurrency(total)}</span>
          </span>
        </button>
      )}
    </div>
  );
}