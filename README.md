🚀 Arquitetura e Módulos do Sistema
A aplicação foi desenhada em três frentes simultâneas, conectadas em tempo real via arquitetura Serverless (Firebase):

1. 💻 Painel do Caixa (PDV)
O hub central da operação. Focado em agilidade máxima e redução de cliques.

Gestão de Pedidos Omnichannel: Recepção instantânea de comandas (salão) e delivery (catálogo digital).

Integração Nativa com WhatsApp (Evolution API): Automação de status. Quando o caixa avança o pedido para "Em preparo" ou "Saiu para entrega", o cliente é notificado automaticamente. Inclui gerenciamento de sessão/QR Code nativo na interface.

Gestão Inteligente de Sessões (Mesas): Algoritmo que agrupa e separa o histórico de consumo de uma mesma mesa baseado no timestamp de abertura e fechamento, gerando documentos financeiros isolados para auditoria e reimpressão térmica.

Edição de Cardápio e Estoque em Tempo Real: Painel CRUD para alteração de preços, ingredientes e toggle rápido de "Produto Esgotado". As mutações refletem em milissegundos nos terminais dos garçons e no smartphone dos clientes em casa.

Dashboard Financeiro & Analytics: Indicadores de performance com cálculo de faturamento (diário/semanal/mensal), ticket médio e ranking de produtos mais vendidos.

2. 📱 Comanda Eletrônica (Terminal Garçom)
Interface Mobile-First otimizada para uso em movimento no salão.

Autenticação Rápida: Login numérico via PinLock.

Roteamento Ágil de Pedidos: Abertura de comandas com vinculação de operador e mesa.

Lógica Fracionada (Meia a Meia): Algoritmo que calcula automaticamente o valor do produto assumindo o preço do sabor mais caro (regra padrão de pizzarias).

Sync Cozinha-Salão: Envio imediato da comanda para a fila do caixa e spooler da impressora da cozinha.

3. 🛒 Catálogo Digital (Cliente Final)
A vitrine virtual para autoatendimento remoto.

Cardápio Reativo: Oculta produtos esgotados dinamicamente com base nas regras do Caixa.

Smart Cart: Carrinho com cálculo automatizado de subtotal e taxa de entrega variável.

Checkout via WhatsApp: Montagem de um payload de texto sanitizado e envio direto para o número oficial da loja, facilitando o fluxo de envio de comprovantes PIX.

🛠️ Tecnologias Utilizadas
Front-end

React (v19) + TypeScript: Componentização reativa e tipagem estática rigorosa.

Vite: Bundler de alta performance.

Tailwind CSS: Estilização utilitária e responsiva.

TanStack Router: Gerenciamento moderno e seguro de rotas baseadas em arquivos.

Lucide React: Iconografia vetorizada.

Back-end, Dados & Integrações

Firebase (Firestore): Banco de dados NoSQL em tempo real.

Evolution API + Axios: Comunicação back-end robusta para disparos do WhatsApp Business.

Node.js (Hardware Bridge): Microserviço local utilizando a biblioteca node-thermal-printer e CORS para bypass das caixas de diálogo nativas dos navegadores, imprimindo cupons térmicos (EPSON/Genéricas) de forma silenciosa via protocolo ESC/POS.

🛡️ Segurança e Banco de Dados
Regras de Firestore (Security Rules): Proteção rigorosa contra Injeção/Mutação de dados.

Clientes podem apenas inserir novos pedidos. Exclusão direta (delete) é bloqueada a nível de banco.

Logs de auditoria (historico_whatsapp) são imutáveis (apenas operações de criação e leitura permitidas).

Controle de Acesso Front-end: Áreas gerenciais (/caixa e /garcom) são envelopadas por um componente de bloqueio em tela (PinLock), mitigando operações indevidas no salão.

⚙️ Como Executar o Projeto (Desenvolvimento)
Pré-requisitos
Node.js (v18+)

Projeto Firebase configurado (com Firestore Ativado)

Acesso a uma instância da Evolution API (VPS ou Localhost)

Passos de Instalação
Clone o repositório:

Bash
git clone https://github.com/seu-usuario/pizzaria-2-irmaos.git
cd pizzaria-2-irmaos
Instale as dependências:

Bash
npm install
Configure as Variáveis de Ambiente:
Crie um arquivo .env na raiz do projeto contendo as chaves de acesso:

Snippet de código
# Firebase
VITE_FIREBASE_API_KEY=sua_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu_auth_domain
VITE_FIREBASE_PROJECT_ID=seu_project_id
VITE_FIREBASE_STORAGE_BUCKET=seu_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
VITE_FIREBASE_APP_ID=seu_app_id

# Motor de Impressão Local (Node.js)
VITE_IMPRESSORA_URL=http://localhost:3001

# Automação WhatsApp (Evolution API)
VITE_WHATSAPP_API_URL=sua_url_da_api
VITE_WHATSAPP_INSTANCE_NAME=nome_da_instancia
VITE_WHATSAPP_API_KEY=sua_apikey_global
Inicie o servidor de desenvolvimento:

Bash
npm run dev
O sistema estará acessível em http://localhost:5173.

🖨️ Sobre o Motor de Impressão (Fallback & Timeout)
Para garantir que o fluxo de caixa não congele durante o spooling de impressão no Windows (cenário comum em horários de pico com múltiplas vias de comanda), o Front-end envia um JSON estruturado para a ponte Node.js e aguarda um retorno condicionado a um Timeout adaptativo (20 segundos).
Caso a ponte local seja desligada, o sistema aplica um fallback gracefully, chamando o modal de impressão nativo do navegador window.print() estritamente formatado via CSS @media print para bobinas de 58mm/80mm.

Desenvolvido com dedicação para modernizar e resolver problemas reais do varejo alimentício. 🚀
