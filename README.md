# ChatVault

Extensão para Chrome e Edge que salva, organiza e exporta conversas do **ChatGPT**, **Gemini** e **Grok**. Roda inteiramente no navegador, nada é enviado para nenhum servidor.

## Recursos

- Salvar a conversa aberta na aba, com rolagem automática para carregar o histórico completo.
- Captura também as imagens da conversa (embutidas no salvamento, para funcionarem offline nos exports).
- Nome da conversa já pré-preenchido com o título da aba.
- Filtro antes de exportar: tudo, só suas mensagens ou só as da IA.
- Exportação em **PDF**, **Markdown**, **HTML** e **TXT**, com usuário e IA separados visualmente.
- Seleção múltipla e exportação combinada em um único arquivo.
- Modelos de prompt reutilizáveis: copiar ou inserir direto na caixa de texto da IA.
- Tema claro/escuro, busca e ordenação.

## Instalação

**Chrome**
1. Baixe ou clone este repositório
2. Acesse `chrome://extensions/`
3. Ative o **Modo do desenvolvedor**
4. Clique em **Carregar sem compactação** e selecione a pasta do ChatVault

**Edge**
1. Baixe ou clone este repositório
2. Acesse `edge://extensions/`
3. Ative o **Modo de desenvolvedor**
4. Clique em **Carregar sem compactação** e selecione a pasta do ChatVault

Depois é só abrir uma conversa no ChatGPT, Gemini ou Grok e usar o ícone da extensão.

## Como funciona a extração

A leitura do conteúdo é feita por `scripts/content.js`, que roda na página e identifica cada mensagem pelo DOM. Como esses sites mudam a estrutura com alguma frequência, cada um tem uma estratégia principal e alternativas de fallback:

| Site    | Seletor principal                                                        |
|---------|--------------------------------------------------------------------------|
| ChatGPT | `[data-message-author-role]` + `.markdown`                               |
| Gemini  | `user-query .query-text-line` e `model-response … div.markdown-main-panel` |
| Grok    | `[data-testid="user-message"]` / `[data-testid="assistant-message"]` + `.response-content-markdown` |

## Exportação em PDF

O PDF é gerado a partir do mesmo HTML usado no export `.html`: a extensão abre `export.html`, monta a conversa formatada e chama o diálogo de impressão do navegador. Basta escolher "Salvar como PDF". Isso mantém o texto selecionável e evita dependências externas.

## Privacidade

Tudo é guardado localmente em `chrome.storage.local`. Não há contas, telemetria nem envio de dados. As permissões pedidas se limitam aos domínios do ChatGPT, Gemini e Grok, necessárias para ler a conversa aberta.

## Estrutura

```
ChatVault/
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── scripts/
│   ├── content.js
│   ├── print-view.js
├── app.css
├── export.html
├── manifest.json
├── popup.css
├── popup.html
├── popup.js
└── README.md
```

## Privacidade

As sessões ficam apenas no perfil local do navegador. O ChatVault não tem servidor próprio, não envia URLs para serviços externos e não carrega código remoto. As permissões pedidas se limitam aos domínios do ChatGPT, Gemini e Grok, necessárias para ler a conversa aberta.

## Compatibilidade

Chrome e Edge com suporte a Manifest V3.

## Licença

MIT. Veja [LICENSE](LICENSE).
