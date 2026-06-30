🍕 Pizzaria 2 Irmãos - Sistema de PDV e Catálogo Digital
Um sistema completo, responsivo e inteligente de Ponto de Venda (PDV), gestão de mesas e catálogo digital, desenvolvido especialmente para automatizar e escalar as operações diárias de uma pizzaria.

🚀 Funcionalidades
O sistema é dividido em três módulos principais para atender a diferentes fluxos do restaurante:

1. Painel do Caixa (PDV)
Gestão de Pedidos: Visualização em tempo real de novos pedidos, sejam eles de mesas ou delivery (WhatsApp/Catálogo).

Integração Automatizada com WhatsApp (Evolution API): Envio automático de mensagens para o cliente a cada mudança de status ("Em preparo", "Saiu para entrega", "Pronto para retirada"). O painel possui um gerenciador embutido para ler o QR Code e verificar o status da conexão sem precisar abrir abas externas.

Gestão Inteligente de Mesas: Separação entre mesas abertas e histórico de mesas finalizadas. O sistema agrupa as comandas finalizadas de forma inteligente baseada na sessão (hora de abertura e fechamento), permitindo reimprimir a conferência completa exata de clientes anteriores, mesmo que a mesa tenha rodado várias vezes na noite.

Edição Expressa de Cardápio: Ferramenta para alterar preços e ingredientes/descrições de produtos diretamente na tela do Caixa. As mudanças refletem instantaneamente no tablet dos garçons e no celular dos clientes.

Dashboard Financeiro: Acompanhamento de faturamento diário/semanal/mensal, quantidade de pedidos, ticket médio e Top 5 de itens mais vendidos.

Controle de Estoque em Tempo Real: Bloqueio e desbloqueio de itens do cardápio marcando-os como "Esgotados" com apenas um clique.

Segurança e Log: Acesso protegido por senhas numéricas (PIN) independentes para Caixa e Garçons, além de logs invisíveis no Firebase (historico_whatsapp) para auditoria de mensagens enviadas.

2. Comanda Eletrônica (Garçom)
Acesso Restrito: Autenticação rápida por PIN exclusivo para a equipe de salão.

Gestão de Mesas: Abertura de comandas vinculadas ao número da mesa e lançamento rápido de itens.

Pizza Meia a Meia: Lógica customizada para pedidos de pizzas com dois sabores, assumindo automaticamente o valor do sabor mais caro.

Observações: Inserção de notas no pedido para a cozinha (ex: "Sem cebola", "Borda recheada").

Sincronização Imediata: Os pedidos caem na mesma hora na tela do Caixa e já são disparados para a impressora da cozinha.

3. Catálogo Digital (Cliente)
Cardápio Online Vivo: Interface amigável para o cliente navegar pelos produtos. Esgotamentos ou mudanças de preço feitas no Caixa são atualizadas ao vivo na tela do cliente.

Carrinho Dinâmico: Gestão inteligente com cálculo de subtotal, taxas de entrega e valor total.

Integração com WhatsApp: Envio do pedido perfeitamente formatado para o número oficial da pizzaria, facilitando a confirmação e envio de comprovantes PIX.

Opções de Entrega e Pagamento: Suporte para Retirada, Consumo no Local e Delivery (com taxa), além das formas de pagamento da loja.

💻 Tecnologias e Ferramentas
React (v19) + TypeScript: Base da aplicação para interfaces dinâmicas, tipadas e reativas.

Tailwind CSS: Estilização utilitária focada em responsividade (Mobile First e layouts fluidos para PDV).

Vite: Bundler super rápido para desenvolvimento e build.

Firebase Firestore: Banco de dados NoSQL em tempo real, garantindo que caixas, garçons e clientes vejam dados atualizados simultaneamente.

Evolution API + Axios: Comunicação back-end robusta para disparos e gerenciamento de sessões do WhatsApp Business.

TanStack Router: Roteamento moderno e seguro para as trocas de telas.

Lucide React: Biblioteca de ícones elegantes e consistentes.

⚙️ Como Rodar o Projeto (Desenvolvimento)
Pré-requisitos

Node.js instalado (versão 18+ recomendada).

Conta no Firebase com Firestore Database configurado.

Instância da Evolution API rodando (Local ou VPS).

Instalação

Clone o repositório:

Bash
git clone https://github.com/seu-usuario/pizzaria-2-irmaos.git
cd pizzaria-2-irmaos
Instale as dependências:

Bash
npm install
Configure as variáveis de ambiente (.env):

Crie o arquivo .env na raiz do projeto.

Adicione as chaves do Firebase, URLs da Impressora (VITE_IMPRESSORA_URL) e credenciais da Evolution API (VITE_WHATSAPP_API_URL, INSTANCE_NAME, e API_KEY).

Inicie o servidor:

Bash
npm run dev
O projeto estará disponível em http://localhost:5173.

🖨️ Integração com Impressora Térmica e Backend Node
O sistema foi desenhado para contornar a limitação de impressão silenciosa dos navegadores.
Ele realiza requisições POST para a ponte local (ex: http://localhost:3001/imprimir) contendo o objeto JSON do pedido estruturado.
Para o funcionamento ideal no Caixa, é necessário rodar o motor local em Node.js (server.js ou printer.js) configurado com cors e com a biblioteca node-thermal-printer, que repassa o papel formatado diretamente para a impressora EPSON (ou genérica) no Windows.

O front-end conta com tratamento inteligente de Timeout, evitando o congelamento da tela (Impressora Offline) caso o spooler do Windows atrase o processamento de muitas comandas sequenciais.

🛡️ Segurança e Banco de Dados
Controle de Acesso: Áreas vitais bloqueadas via PIN (PinLock). Recomenda-se a alteração das senhas padrões diretamente na aba de Configurações do PDV no primeiro acesso.

Regras do Firestore: O sistema exige configurações de segurança (firestore.rules) para proteger a integridade dos pedidos, permitir a edição em tempo real das configuracoes de loja/cardápio, e criar registros de logs silenciosos (historico_whatsapp) imutáveis.

Desenvolvido com ❤️ e muita tecnologia para modernizar e escalar o atendimento de pizzarias reais.
