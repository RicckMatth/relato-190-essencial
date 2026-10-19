# Relato 190 — Essencial + Endereços

> Extensão para Google Chrome que agiliza atendimentos do **190** com cópia em um clique, integração com Google Maps, conferência inteligente de endereços e sugestões por CEP.

[![Última release](https://img.shields.io/github/v/release/RicckMatth/relato-190-essencial?style=flat-square&label=release)](https://github.com/RicckMatth/relato-190-essencial/releases/latest)
[![Código master](https://img.shields.io/badge/master-5.9.3-0a7a6e?style=flat-square)](https://github.com/RicckMatth/relato-190-essencial/tree/master)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=google-chrome)](https://developer.chrome.com/docs/extensions/mv3/)
[![Licença](https://img.shields.io/badge/licença-MIT-green?style=flat-square)](LICENSE)

---

## ⬇️ Download

**[⬇ Baixar versão mais recente — v5.9.3 (ZIP)](https://github.com/RicckMatth/relato-190-essencial/archive/refs/heads/master.zip)**

> O download principal contém o código mais recente da branch `master`, atualmente **v5.9.3**, com seletores de campos definidos no código e reconhecimento automático do SADE. Campos não reconhecidos ou ambíguos ainda podem exigir confirmação ou vinculação manual.

**Release formal no GitHub:** a última release publicada, conferida em 19/10/2026, é a **v5.6.3**, de 15/10/2026. Ela não inclui o adaptador de reconhecimento automático do SADE presente na `master`; apenas reutiliza vínculos e perfis previamente salvos. [Consultar release anterior](https://github.com/RicckMatth/relato-190-essencial/releases/tag/v5.6.3).

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| **Popup Informativo no Topo (v5.8.0)** | Sugestões inteligentes de município e logradouro exibidas em card informativo no centro superior da tela, estável e sem obstruir campos |
| **Busca Híbrida de Endereços** | HERE Technologies com fallback automático para ViaCEP oficial (Paraná/Brasil) e catálogo offline enriquecido |
| **Reconhecimento SADE** | Reconhece e vincula automaticamente os 9 campos de atendimento do sistema SADE dentro de iframes dinâmicos |
| **Cópia em um clique** | Copia nome · telefone · cidade · rua · número · bairro · complemento · relato em um toque, formatado em caixa alta com separador `-` ou `\|` |
| **Google Maps integrado** | Abre e atualiza o Maps automaticamente conforme o endereço é preenchido |
| **Street View** | Tenta abrir panorâmica próxima por coordenadas de CEP ou posição atual do Maps |
| **Endereço inteligente** | Compara rua, bairro e cidade com fontes públicas (ViaCEP, BrasilAPI, IBGE) |
| **Verificação de CEP** | Confere rua, bairro e município pelo CEP; mostra divergências e permite aplicar com um clique |
| **Sugestões de rua/bairro** | Detecta erros de digitação em rua e bairro e sugere o nome correto com botão "Usar" |
| **Perfis de campos** | Salva e recupera vínculos de campos por site; reconhecimento automático de perfis compatíveis |
| **Barra arrastável** | Mini-barra flutuante reposicionável abaixo do campo principal |
| **Privacidade** | Histórico local criptografado somente quando habilitado, com expiração de 1 hora; envio ao Gemini somente após confirmação |

---

## 🚀 Instalação

### Método 1 — Download direto (recomendado)

1. **[Baixe a versão mais recente com reconhecimento automático (ZIP)](https://github.com/RicckMatth/relato-190-essencial/archive/refs/heads/master.zip)**
2. Extraia o ZIP. A pasta normalmente se chamará `relato-190-essencial-master`.
3. Abra o Chrome e acesse `chrome://extensions`
4. Ative o **Modo do desenvolvedor** (canto superior direito)
5. Clique em **"Carregar sem compactação"**
6. Selecione a pasta extraída que contém `manifest.json`

### Método 2 — Clonar repositório

```bash
git clone https://github.com/RicckMatth/relato-190-essencial.git
```

Depois siga os passos 3–6 acima, selecionando a pasta clonada.

---

## 🔧 Como usar

1. **Abra o Chrome** e navegue até a tela de atendimento do sistema
2. **Clique no ícone** da extensão na barra do Chrome
3. No SADE, aguarde o reconhecimento automático dos campos e confira o status nas **Configurações (⚙)**.
4. Se algum campo não for reconhecido ou precisar de confirmação, confirme o campo indicado ou use **"Vincular todos os campos (assistente)"** para selecionar os campos manualmente.
5. Volte ao painel principal — os dados serão copiados e inseridos com um clique

### Endereço inteligente

- Marque **"Autorizar consultas online"** no painel de endereço
- A extensão consultará ViaCEP, BrasilAPI e IBGE automaticamente
- Sugestões de correção para **cidade, rua e bairro** aparecem em tempo real
- Se a rua não for localizada, um aviso amarelo indica o problema e sugere o nome mais próximo
- O bairro é verificado com base na rua encontrada; divergências geram sugestão clicável

---

## 🔒 Privacidade e limites

- **Não armazena** dados de ocorrências — apenas vínculos de campos e perfis
- Consultas ao ViaCEP/BrasilAPI/IBGE só ocorrem **após autorização explícita** do operador
- Nome, telefone, complemento e relato **nunca são enviados** às APIs
- CEP não identifica o imóvel; número da residência **não é verificado**
- Resultados de Street View e coordenadas são **aproximados** — confirme sempre no sistema oficial

---

## 📋 Histórico de versões

### v5.9.3 — Chaves Gemini e teste de conexão

- Corrige a validação da chave de API Gemini: agora aceita o formato antigo `AIza...` e o novo formato de autenticação `AQ....` criado pelo Google AI Studio. Não depende do prefixo para declarar validade.
- Botão **Testar conexão** em Configurações → Gemini: envia somente uma frase fictícia ao modelo (nunca dados de atendimento) e informa se o Google respondeu.
- Diferencia falhas de autenticação (401), permissão (403), modelo (404) e cota (429). Salvar a chave não comprova a autenticação.
- **Download do código da master (inclui v5.9.3):** https://github.com/RicckMatth/relato-190-essencial/archive/refs/heads/master.zip
- Credenciais nunca devem ser copiadas para o repositório ou registradas no console. Se foram divulgadas, revogue-as e gere novas.



### v5.7.0
- **Reconhecimento automático do SADE**: adaptador `sade-adapter.js` com heurísticas de alta precisão para os 9 campos de atendimento: Nome, Telefone, Município, Rua, Número, Bairro, Complemento, Relato (texto principal) e CEP
- Suporte nativo à arquitetura do SADE com **iframes dinâmicos** (`#iframeContainer` e `iframe[name="container"]`), `contentDocument` e `MutationObserver` para alterações assíncronas via jQuery/AJAX
- **Precedência estrita de vínculos**: (1) Mapeamento nativo SADE validado -> (2) Perfil salvo compatível -> (3) Assistente manual
- **Painel visual SADE**: status discreto na barra principal (`SADE reconhecido`, `Aguardando formulário`, etc.) e seção detalhada em Configurações com badges de estado por campo (`Automático`, `Confirmar`, `Não encontrado`)
- **Proteção de destino e idempotência**: exclusão explícita de caixas de observações, histórico, buscas e filtros do campo de relato; cliques repetidos preservam o texto sem duplicação de cabeçalhos
- Suporte a simulador de teste (`teste-sade.html`) e suíte de testes automatizados (`test_sade_suite.js` e `chrome_test.js`)
- **Segurança estrita**: sem coleta de credenciais, sem leitura de cookies/tokens, sem submissão automática

### v5.6.3
- Street View abre panorâmica por URL oficial usando coordenadas de CEP ou centro do Maps
- Sincronização do Maps continua ativa após Street View sem sobrescrever a panorâmica
- Busca de rua usa **todos os tokens** do logradouro em paralelo no ViaCEP (mais resistente a erros de digitação)
- Sugestões de **bairro** baseadas na rua encontrada; aviso quando rua não é localizada nas fontes
- Cidade incluída nas sugestões de rua para facilitar distinção entre municípios

### v5.6.2
- Barra flutuante arrastável com posição salva por página
- Botão ↩ para reencaixar a barra abaixo do campo principal

### v5.6.1
- Cartão de CEP com rua, bairro, município, divergências e botão de aplicação
- Street View orientado por seleção manual no Maps

---

## 🧪 Testes e Ambiente Simulado SADE

A extensão inclui um ambiente de simulação completo reproduzindo a arquitetura de tela do SADE:

- **`teste-sade.html`**: Página de teste que emula o container com `#iframeContainer`, formulário de atendimento dinâmico, navegação entre telas, recriação de DOM (jQuery/AJAX) e limpeza de ocorrência.
  - Para testar localmente: abra `teste-sade.html` no Chrome (com a opção *"Permitir acesso a URLs de arquivo"* ativa em `chrome://extensions` para a extensão), ou sirva via servidor HTTP local (`npx serve .` ou `node chrome_test.js`).
- **`test_sade_suite.js`**: Suíte de testes automatizados com 12 asserções cobrindo integridade do manifest, injeção de scripts, heurísticas dos 9 campos, ordenação, exclusão de observações/histórico/filtros, proteção contra vínculo circular, idempotência e ausência de chamadas destrutivas. Execute com:
  ```bash
  node test_sade_suite.js
  ```
- **`chrome_test.js`**: Teste end-to-end automatizado via Chrome Headless e Chrome DevTools Protocol (CDP), validando a injeção real em 4 fases: (1) Mapeamento inicial 100%, (2) Mutação assíncrona AJAX, (3) Tela em branco/Aguardando formulário, (4) Restauração de formulário. Execute com:
  ```bash
  node chrome_test.js
  ```

> ⚠️ **Aviso de Ambiente**: Conforme especificado, o reconhecimento foi validado com arquitetura de iframes e formulário simulado (`teste-sade.html`). Em ambiente oficial do SADE, caso algum campo apresente rótulo interno não previsto, o operador pode utilizar o assistente manual de vinculação, ou inspecionar o atributo correspondente para inclusão no mapa heurístico.

---

## 🛠️ Permissões utilizadas

| Permissão | Motivo |
|---|---|
| `activeTab` | Ler e interagir com a aba atual |
| `scripting` | Injetar o painel na página de atendimento |
| `storage` | Salvar vínculos de campos e perfis |
| `clipboardWrite` | Copiar o texto montado para a área de transferência |
| `tabs` | Abrir e monitorar a aba do Google Maps |
| `host_permissions` (ViaCEP, BrasilAPI, IBGE) | Consultas de endereço somente após autorização |

---

## 📄 Licença

MIT © 2024 — Uso institucional. Consulte os termos de uso do ViaCEP, BrasilAPI e IBGE antes de utilizar em produção.


### v5.9.2 — Ferramentas e correção de municípios

- Sugestões de municípios com catálogo completo do Paraná obtido do IBGE, com fallback local que inclui Pato Branco (ex.: `Pato` → `Pato Branco`).
- Barra de ferramentas: CAPS para converter o relato principal em maiúsculas; IA com confirmação explícita antes de enviar texto ao Gemini e indicador de carregamento.
- Chave Gemini guardada criptografada com AES-GCM e chave não exportável no IndexedDB da extensão; não pede senha a cada uso. A proteção depende da segurança do perfil do navegador e não impede acesso por quem controla o perfil desbloqueado.
- Resultado do Gemini em caixa independente; botão **Mesclar** modifica o relato apenas após confirmação, e somente se o texto original não foi alterado.
- Histórico automático **desligado por padrão**, habilitável nas configurações após autorização institucional. Registros cifrados expiram após 1 hora e a extensão impede a consulta após o prazo; backups e armazenamento do sistema operacional não têm eliminação física garantida.
- Não são enviadas ocorrências a serviços externos sem ação e confirmação explícitas. Teste primeiro em simulador, sem dados reais.
