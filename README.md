# ChatVault

Extensão para Chrome e Edge que salva, organiza e exporta conversas do **ChatGPT**, **Gemini** e **Grok**. Separa o que é seu do que é da IA, deixa filtrar antes de exportar e guarda modelos de prompt para reaproveitar. Roda inteiramente no navegador — nada é enviado para nenhum servidor.

## Recursos

- Salvar a conversa aberta na aba, com rolagem automática para carregar o histórico completo.
- Nome da conversa já pré-preenchido com o título da aba.
- Filtro antes de exportar: tudo, só suas mensagens ou só as da IA.
- Exportação em **PDF**, **Markdown**, **HTML** e **TXT**, com usuário e IA separados visualmente.
- Seleção múltipla e exportação combinada em um único arquivo.
- Modelos de prompt reutilizáveis: copiar ou inserir direto na caixa de texto da IA.
- Tema claro/escuro, busca e ordenação.

## Instalação

Enquanto não está publicada nas lojas, dá para rodar em modo desenvolvedor:

1. Baixe ou clone este repositório.
2. Acesse `chrome://extensions` (ou `edge://extensions`).
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta do projeto.

Depois é só abrir uma conversa no ChatGPT, Gemini ou Grok e usar o ícone da extensão.

## Como funciona a extração

A leitura do conteúdo é feita por `scripts/content.js`, que roda na página e identifica cada mensagem pelo DOM. Como esses sites mudam a estrutura com alguma frequência, cada um tem uma estratégia principal e alternativas de fallback:

| Site    | Seletor principal                                                        |
|---------|--------------------------------------------------------------------------|
| ChatGPT | `[data-message-author-role]` + `.markdown`                               |
| Gemini  | `user-query .query-text-line` e `model-response … div.markdown-main-panel` |
| Grok    | `[data-testid="user-message"]` / `[data-testid="assistant-message"]` + `.response-content-markdown` |

Se algum site alterar a marcação e a extração parar de funcionar, os seletores ficam concentrados nos `adapters` desse arquivo, fáceis de ajustar.

## Exportação em PDF

O PDF é gerado a partir do mesmo HTML usado no export `.html`: a extensão abre `export.html`, monta a conversa formatada e chama o diálogo de impressão do navegador. Basta escolher "Salvar como PDF". Isso mantém o texto selecionável e evita dependências externas.

## Privacidade

Tudo é guardado localmente em `chrome.storage.local`. Não há contas, telemetria nem envio de dados. As permissões pedidas se limitam aos domínios do ChatGPT, Gemini e Grok, necessárias para ler a conversa aberta.

## Estrutura

```
manifest.json          Manifest V3
popup.html / popup.js  Interface e lógica do popup
popup.css              Estilos base
app.css                Componentes adicionais
export.html            Página usada para gerar o PDF
scripts/content.js     Leitura e inserção de texto por site
scripts/print-view.js  Renderização da página de impressão
icons/                 Ícones 16/32/48/128
```

## Licença

MIT. Veja [LICENSE](LICENSE).
