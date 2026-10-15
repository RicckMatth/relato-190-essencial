# Relato 190 — Essencial + Endereços

> Extensão para Google Chrome que agiliza atendimentos do **190** com cópia em um clique, integração com Google Maps, conferência inteligente de endereços e sugestões por CEP.

[![Versão](https://img.shields.io/badge/versão-5.6.3-0a7a6e?style=flat-square)](https://github.com/RicckMatth/relato-190-essencial/releases/latest)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=google-chrome)](https://developer.chrome.com/docs/extensions/mv3/)
[![Licença](https://img.shields.io/badge/licença-MIT-green?style=flat-square)](LICENSE)

---

## ⬇️ Download

**[⬇ Baixar última versão (ZIP)](https://github.com/RicckMatth/relato-190-essencial/releases/latest/download/relato-190-essencial.zip)**

> Após baixar, siga as instruções de instalação abaixo.

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| **Cópia em um clique** | Copia nome · telefone · endereço · relato em um toque, formatado com separador configurável |
| **Google Maps integrado** | Abre e atualiza o Maps automaticamente conforme o endereço é preenchido |
| **Street View** | Tenta abrir panorâmica próxima por coordenadas de CEP ou posição atual do Maps |
| **Endereço inteligente** | Compara rua, bairro e cidade com fontes públicas (ViaCEP, BrasilAPI, IBGE) |
| **Verificação de CEP** | Confere rua, bairro e município pelo CEP; mostra divergências e permite aplicar com um clique |
| **Sugestões de rua/bairro** | Detecta erros de digitação em rua e bairro e sugere o nome correto com botão "Usar" |
| **Perfis de campos** | Salva e recupera vínculos de campos por site; reconhecimento automático de perfis compatíveis |
| **Barra arrastável** | Mini-barra flutuante reposicionável abaixo do campo principal |
| **Privacidade** | Nenhum dado de ocorrência é armazenado; consultas externas só com autorização explícita |

---

## 🚀 Instalação

### Método 1 — Download direto (recomendado)

1. **[Baixe o arquivo ZIP](https://github.com/RicckMatth/relato-190-essencial/releases/latest/download/relato-190-essencial.zip)**
2. Extraia a pasta `relato-190-essencial`
3. Abra o Chrome e acesse `chrome://extensions`
4. Ative o **Modo do desenvolvedor** (canto superior direito)
5. Clique em **"Carregar sem compactação"**
6. Selecione a pasta `relato-190-essencial` extraída

### Método 2 — Clonar repositório

```bash
git clone https://github.com/RicckMatth/relato-190-essencial.git
```

Depois siga os passos 3–6 acima, selecionando a pasta clonada.

---

## 🔧 Como usar

1. **Abra o Chrome** e navegue até a tela de atendimento do sistema
2. **Clique no ícone** da extensão na barra do Chrome
3. Acesse **Configurações (⚙)** e clique em **"Vincular todos os campos (assistente)"**
4. Clique em cada campo do formulário conforme solicitado
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

### v5.6.3 (atual)
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
