/**
 * address-popup.js — Popup Flutuante Semitransparente (Glassmorphism) para Relato 190 (v5.8.0)
 * Exibe sugestões inteligentes de Rua, Município e Bairro diretamente na tela sobre o campo SADE,
 * ancorado por coordenadas relativas ao iframeContainer, com navegação por teclado e suporte a temas.
 */
(function (root) {
  'use strict';

  class AddressPopup {
    constructor(shadowRoot, options = {}) {
      this.shadow = shadowRoot;
      this.options = options;
      this.container = null;
      this.targetEl = null;
      this.suggestions = [];
      this.selectedIndex = -1;
      this.onSelectCallback = null;
      this.onUndoCallback = null;
      this.previousValue = '';
      this.scrollListener = null;
      this.keyListener = null;
      this.visible = false;

      this.initDom();
    }

    /**
     * Cria a estrutura DOM do popup dentro do Shadow Root da extensão
     */
    initDom() {
      this.container = document.createElement('div');
      this.container.className = 'relato-address-popup';
      this.container.setAttribute('role', 'dialog');
      this.container.setAttribute('aria-label', 'Sugestões de endereço');
      this.container.hidden = true;

      this.container.innerHTML = `
        <div class="popup-header">
          <span class="popup-icon">📍</span>
          <span class="popup-title">Sugestão de Endereço</span>
          <span class="popup-source">HERE</span>
          <button type="button" class="popup-close" title="Fechar sugestões" aria-label="Fechar">&times;</button>
        </div>
        <div class="popup-body">
          <div class="popup-list" role="listbox"></div>
        </div>
        <div class="popup-footer">
          <span class="popup-hint">Use &uarr;&darr; e Enter para escolher &bull; Esc para fechar</span>
          <div class="popup-undo-area" hidden>
            <span class="popup-undo-text"></span>
            <button type="button" class="popup-undo-btn">Desfazer</button>
          </div>
        </div>
      `;

      // Evento de fechar
      this.container.querySelector('.popup-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
      });

      // Evento de desfazer
      this.container.querySelector('.popup-undo-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof this.onUndoCallback === 'function') {
          this.onUndoCallback(this.previousValue);
        }
        this.hide();
      });

      this.shadow.append(this.container);
    }

    /**
     * Calcula as coordenadas do elemento em relação à janela principal,
     * subindo a cadeia de iframes se o elemento estiver dentro do SADE.
     */
    getViewRect(el) {
      if (!el || el.nodeType !== 1) return null;
      const rect = el.getBoundingClientRect();
      let left = rect.left, top = rect.top;

      try {
        let win = el.ownerDocument.defaultView;
        while (win && win !== window) {
          const frame = win.frameElement;
          if (!frame) break;
          const frameRect = frame.getBoundingClientRect();
          left += frameRect.left;
          top += frameRect.top;
          win = frame.ownerDocument.defaultView;
        }
      } catch (_) {}

      return {
        left,
        top,
        width: rect.width,
        height: rect.height,
        bottom: top + rect.height,
        right: left + rect.width
      };
    }

    /**
     * Posiciona o popup no centro superior da tela como um banner informativo
     */
    reposition() {
      if (!this.visible || !this.container) return;

      const popupW = Math.min(520, Math.max(360, window.innerWidth - 32));
      const leftPos = Math.max(16, Math.round((window.innerWidth - popupW) / 2));

      this.container.style.position = 'fixed';
      this.container.style.width = `${popupW}px`;
      this.container.style.top = '18px';
      this.container.style.left = `${leftPos}px`;
      this.container.style.transform = 'none';
      this.container.style.zIndex = '2147483647';
      this.container.style.opacity = '1';
    }

    /**
     * Exibe o popup com uma lista de sugestões próximo ao campo alvo
     * @param {HTMLElement} targetEl - Elemento input a ser ancorado
     * @param {Array} suggestions - Lista de sugestões normalizadas
     * @param {Object} options - { title, source, onSelect, onUndo }
     */
    show(targetEl, suggestions = [], options = {}) {
      if (!targetEl || !suggestions || !suggestions.length) {
        this.hide();
        return;
      }

      this.targetEl = targetEl;
      this.suggestions = suggestions;
      this.selectedIndex = 0; // Primeiro item pré-selecionado para agilidade no teclado
      this.onSelectCallback = options.onSelect;
      this.onUndoCallback = options.onUndo;
      this.previousValue = targetEl.value || '';

      // Título contextual e fonte
      const titleEl = this.container.querySelector('.popup-title');
      const sourceEl = this.container.querySelector('.popup-source');
      titleEl.textContent = options.title || 'Sugestão de Endereço';
      sourceEl.textContent = options.source || 'HERE';

      // Renderizar itens
      this.renderList();

      // Esconder área de desfazer inicialmente
      this.container.querySelector('.popup-undo-area').hidden = true;
      this.container.querySelector('.popup-list').hidden = false;

      this.container.hidden = false;
      this.visible = true;

      // Posicionar imediatamente e agendar ajuste pós-render
      this.reposition();
      requestAnimationFrame(() => this.reposition());

      // Anexar listeners de scroll e teclado
      this.attachEvents();
    }

    /**
     * Renderiza os itens de sugestão no corpo do popup
     */
    renderList() {
      const listEl = this.container.querySelector('.popup-list');
      listEl.replaceChildren();

      this.suggestions.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `popup-item ${index === this.selectedIndex ? 'selected' : ''}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', index === this.selectedIndex ? 'true' : 'false');

        // Conteúdo de texto
        const contentBox = document.createElement('div');
        contentBox.className = 'popup-item-content';

        const mainTitle = document.createElement('div');
        mainTitle.className = 'popup-item-title';
        mainTitle.textContent = item.title || item.street || item.name || '';

        // Detalhes (Bairro, Cidade, CEP)
        const details = document.createElement('div');
        details.className = 'popup-item-details';

        const parts = [];
        if (item.district) parts.push(item.district);
        if (item.city) parts.push(item.city + (item.state ? `/${item.state}` : ''));
        if (item.postalCode) parts.push(`CEP ${item.postalCode}`);
        if (item.subtitle) parts.push(item.subtitle);

        details.textContent = parts.join(' · ') || 'Endereço sugerido';

        contentBox.append(mainTitle, details);

        // Alerta de divergência (se for de outro município ou bairro divergente)
        if (item.divergentCity) {
          const diffBadge = document.createElement('span');
          diffBadge.className = 'popup-badge badge-diff';
          diffBadge.textContent = `Atenção: localizado em ${item.divergentCity}`;
          contentBox.append(diffBadge);
        } else if (item.districtDivergence) {
          const warnBadge = document.createElement('span');
          warnBadge.className = 'popup-badge badge-warn';
          warnBadge.textContent = 'Possível divergência de bairro';
          contentBox.append(warnBadge);
        } else if (item.matchType === 'exact') {
          const exactBadge = document.createElement('span');
          exactBadge.className = 'popup-badge badge-exact';
          exactBadge.textContent = 'Correspondência exata';
          contentBox.append(exactBadge);
        }

        // Botão Usar
        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'popup-use-btn';
        useBtn.textContent = 'Usar';
        useBtn.title = 'Aplicar esta sugestão ao campo';
        useBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectItem(index);
        });

        // Hover do mouse sincroniza seleção
        row.addEventListener('mouseenter', () => {
          this.setSelectedIndex(index);
        });

        // Clique na linha também aplica
        row.addEventListener('click', () => {
          this.selectItem(index);
        });

        row.append(contentBox, useBtn);
        listEl.append(row);
      });
    }

    /**
     * Atualiza o índice destacado por teclado ou mouse
     */
    setSelectedIndex(idx) {
      if (idx < 0) idx = 0;
      if (idx >= this.suggestions.length) idx = this.suggestions.length - 1;
      this.selectedIndex = idx;

      const items = this.container.querySelectorAll('.popup-item');
      items.forEach((item, i) => {
        const isSel = i === this.selectedIndex;
        item.classList.toggle('selected', isSel);
        item.setAttribute('aria-selected', isSel ? 'true' : 'false');
        if (isSel) {
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    }

    /**
     * Aplica a sugestão selecionada
     */
    selectItem(index) {
      const item = this.suggestions[index];
      if (!item) return;

      if (typeof this.onSelectCallback === 'function') {
        this.onSelectCallback(item, this.previousValue);
      }

      // Exibir aviso com opção de desfazer brevemente
      this.showUndoFeedback(item);
    }

    /**
     * Mostra breve estado de confirmação com botão de desfazer
     */
    showUndoFeedback(item) {
      const undoArea = this.container.querySelector('.popup-undo-area');
      const undoText = this.container.querySelector('.popup-undo-text');
      const listEl = this.container.querySelector('.popup-list');

      const appliedName = item.street || item.title || item.name || '';
      undoText.textContent = `Aplicado: ${appliedName}`;

      listEl.hidden = true;
      undoArea.hidden = false;

      // Auto-fechar após 3 segundos
      clearTimeout(this._undoTimer);
      this._undoTimer = setTimeout(() => {
        this.hide();
      }, 3500);
    }

    /**
     * Conecta ouvintes de scroll e de teclas
     */
    attachEvents() {
      this.detachEvents();

      // Reposicionar ao rolar a página principal ou frames
      this.scrollListener = () => {
        requestAnimationFrame(() => this.reposition());
      };
      window.addEventListener('scroll', this.scrollListener, { capture: true, passive: true });
      window.addEventListener('resize', this.scrollListener, { passive: true });

      // Se o elemento estiver em um iframe interno, ouvir eventos do documento interno também
      try {
        if (this.targetEl && this.targetEl.ownerDocument && this.targetEl.ownerDocument.defaultView !== window) {
          const frameWin = this.targetEl.ownerDocument.defaultView;
          frameWin.addEventListener('scroll', this.scrollListener, { capture: true, passive: true });
          frameWin.addEventListener('resize', this.scrollListener, { passive: true });
        }
      } catch (_) {}

      // Fechar ao clicar fora do popup e do elemento alvo
      this.outsideClickListener = (e) => {
        if (!this.visible) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.includes(this.container) || (this.targetEl && (path.includes(this.targetEl) || e.target === this.targetEl))) {
          return;
        }
        this.hide();
      };
      window.addEventListener('pointerdown', this.outsideClickListener, true);

      // Escutar teclado no elemento alvo
      if (this.targetEl) {
        this.keyListener = (e) => {
          if (!this.visible) return;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.setSelectedIndex(this.selectedIndex + 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.setSelectedIndex(this.selectedIndex - 1);
          } else if (e.key === 'Enter') {
            if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
              e.preventDefault();
              e.stopPropagation();
              this.selectItem(this.selectedIndex);
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hide();
          }
        };

        this.targetEl.addEventListener('keydown', this.keyListener, true);
      }
    }

    /**
     * Remove ouvintes de eventos para evitar vazamentos de memória
     */
    detachEvents() {
      if (this.scrollListener) {
        window.removeEventListener('scroll', this.scrollListener, { capture: true });
        window.removeEventListener('resize', this.scrollListener);
        try {
          if (this.targetEl && this.targetEl.ownerDocument && this.targetEl.ownerDocument.defaultView !== window) {
            const frameWin = this.targetEl.ownerDocument.defaultView;
            frameWin.removeEventListener('scroll', this.scrollListener, { capture: true });
            frameWin.removeEventListener('resize', this.scrollListener);
          }
        } catch (_) {}
        this.scrollListener = null;
      }
      if (this.outsideClickListener) {
        window.removeEventListener('pointerdown', this.outsideClickListener, true);
        this.outsideClickListener = null;
      }
      if (this.keyListener && this.targetEl) {
        this.targetEl.removeEventListener('keydown', this.keyListener, true);
        this.keyListener = null;
      }
    }

    /**
     * Esconde o popup
     */
    hide() {
      this.visible = false;
      this.detachEvents();
      if (this.container) {
        this.container.hidden = true;
      }
      this.targetEl = null;
    }
  }

  root.RelatoAddressPopup = AddressPopup;

})(typeof globalThis !== 'undefined' ? globalThis : this);
