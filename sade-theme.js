/**
 * sade-theme.js — Adaptador visual e Design Tokens para o sistema SADE (v5.8.0)
 * Detecta dinamicamente cores, tipografia e temas (claro/escuro) do SADE hospedeiro
 * e define tokens CSS harmoniosos para o Shadow DOM da extensão e o popup flutuante.
 */
(function (root) {
  'use strict';

  // ── Paletas de Fallback Profissionais ────────────────────────────────────
  const PALETTES = {
    light: {
      mode: 'light',
      bg: '#f8fafc',
      surface: 'rgba(255, 255, 255, 0.94)',
      popupBg: 'rgba(255, 255, 255, 0.92)',
      popupBorder: 'rgba(180, 202, 216, 0.65)',
      popupShadow: '0 12px 38px rgba(15, 35, 55, 0.16), 0 2px 8px rgba(15, 35, 55, 0.08)',
      text: '#132832',
      textMuted: '#516f78',
      primary: '#0a6090',
      primaryHover: '#084f78',
      primaryText: '#ffffff',
      accent: '#0d7d6f',
      border: '#cddce2',
      hover: 'rgba(10, 96, 144, 0.07)',
      selected: 'rgba(10, 96, 144, 0.12)',
      badgeAutoBg: '#d8f3eb',
      badgeAutoText: '#085f4e',
      badgeWarnBg: '#fff4dc',
      badgeWarnText: '#7d5312',
      badgeWarnBorder: '#edd59c',
      badgeDiffBg: '#fbeae7',
      badgeDiffText: '#872e22',
      badgeDiffBorder: '#ebc0ba',
      blur: '12px'
    },
    dark: {
      mode: 'dark',
      bg: '#141e2a',
      surface: 'rgba(20, 31, 44, 0.94)',
      popupBg: 'rgba(16, 27, 39, 0.92)',
      popupBorder: 'rgba(46, 70, 92, 0.75)',
      popupShadow: '0 14px 42px rgba(0, 0, 0, 0.55), 0 3px 10px rgba(0, 0, 0, 0.35)',
      text: '#e3edf4',
      textMuted: '#8ba4b3',
      primary: '#38a8db',
      primaryHover: '#4cb4e4',
      primaryText: '#0a1a24',
      accent: '#26b89f',
      border: '#283d50',
      hover: 'rgba(56, 168, 219, 0.12)',
      selected: 'rgba(56, 168, 219, 0.22)',
      badgeAutoBg: '#123933',
      badgeAutoText: '#6fe3cb',
      badgeWarnBg: '#382e14',
      badgeWarnText: '#fad77b',
      badgeWarnBorder: '#6b5420',
      badgeDiffBg: '#3d1b18',
      badgeDiffText: '#f5988e',
      badgeDiffBorder: '#7d3830',
      blur: '14px'
    }
  };

  /**
   * Converte uma cor CSS (rgb, hex) em objeto { r, g, b, a, brightness }
   */
  function parseColor(cssColor) {
    if (!cssColor || typeof cssColor !== 'string') return null;
    cssColor = cssColor.trim();
    if (cssColor.startsWith('rgb')) {
      const parts = cssColor.match(/[\d\.]+/g);
      if (parts && parts.length >= 3) {
        const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]);
        const a = parts[3] ? parseFloat(parts[3]) : 1;
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return { r, g, b, a, brightness };
      }
    }
    if (cssColor.startsWith('#')) {
      let hex = cssColor.slice(1);
      if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return { r, g, b, a: 1, brightness };
      }
    }
    return null;
  }

  /**
   * Detecta se a página ou iframe do SADE está utilizando tema escuro
   */
  function detectIsDark() {
    // 1. Atributos data-theme / class no html ou body
    const docEl = document.documentElement;
    const body = document.body;
    const checkEl = el => {
      if (!el) return null;
      const theme = el.getAttribute('data-theme') || el.getAttribute('theme');
      if (theme) {
        if (/dark|escuro|noite/i.test(theme)) return true;
        if (/light|claro/i.test(theme)) return false;
      }
      if (el.classList.contains('dark') || el.classList.contains('theme-dark')) return true;
      if (el.classList.contains('light') || el.classList.contains('theme-light')) return false;
      return null;
    };

    let result = checkEl(docEl) ?? checkEl(body);
    if (result !== null) return result;

    // 2. Tentar verificar iframe do SADE
    const iframe = document.querySelector('#iframeContainer') || document.querySelector('iframe[name="container"]');
    if (iframe) {
      try {
        const iDoc = iframe.contentDocument;
        if (iDoc) {
          result = checkEl(iDoc.documentElement) ?? checkEl(iDoc.body);
          if (result !== null) return result;
        }
      } catch (_) {}
    }

    // 3. Checar cor computada do body ou topbar
    try {
      const topbar = document.querySelector('.topbar, #topbar, header, [role="banner"]');
      const target = topbar || body;
      if (target) {
        const bg = window.getComputedStyle(target).backgroundColor;
        const parsed = parseColor(bg);
        if (parsed && parsed.a > 0.5) {
          return parsed.brightness < 128;
        }
      }
    } catch (_) {}

    // 4. Preferência do sistema operacional
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }

    return false;
  }

  /**
   * Extrai estilos específicos do SADE para afinar as cores
   */
  function extractSadeColors() {
    const isDark = detectIsDark();
    const base = { ...(isDark ? PALETTES.dark : PALETTES.light) };

    try {
      // Tentar pegar a cor de destaque oficial de um botão primário existente
      const primaryBtn = document.querySelector('.btn-primary, button.primary, button[type="submit"]');
      if (primaryBtn) {
        const style = window.getComputedStyle(primaryBtn);
        const bg = style.backgroundColor;
        const parsed = parseColor(bg);
        if (parsed && parsed.a > 0.5) {
          base.primary = bg;
          base.primaryText = style.color || (parsed.brightness > 130 ? '#111' : '#fff');
        }
      }
    } catch (_) {}

    return base;
  }

  /**
   * Converte a paleta em declarações de variáveis CSS prontas para injeção
   */
  function buildCssVariables(colors) {
    return `
      --relato-mode: ${colors.mode};
      --relato-bg: ${colors.bg};
      --relato-surface: ${colors.surface};
      --relato-popup-bg: ${colors.popupBg};
      --relato-popup-border: ${colors.popupBorder};
      --relato-popup-shadow: ${colors.popupShadow};
      --relato-text: ${colors.text};
      --relato-text-muted: ${colors.textMuted};
      --relato-primary: ${colors.primary};
      --relato-primary-hover: ${colors.primaryHover};
      --relato-primary-text: ${colors.primaryText};
      --relato-accent: ${colors.accent};
      --relato-border: ${colors.border};
      --relato-hover: ${colors.hover};
      --relato-selected: ${colors.selected};
      --relato-badge-auto-bg: ${colors.badgeAutoBg};
      --relato-badge-auto-text: ${colors.badgeAutoText};
      --relato-badge-warn-bg: ${colors.badgeWarnBg};
      --relato-badge-warn-text: ${colors.badgeWarnText};
      --relato-badge-warn-border: ${colors.badgeWarnBorder};
      --relato-badge-diff-bg: ${colors.badgeDiffBg};
      --relato-badge-diff-text: ${colors.badgeDiffText};
      --relato-badge-diff-border: ${colors.badgeDiffBorder};
      --relato-blur: ${colors.blur};
    `;
  }

  /**
   * Aplica dinamicamente as variáveis de tema no Shadow DOM especificado
   */
  function applyTheme(shadowRoot) {
    if (!shadowRoot) return;
    const colors = extractSadeColors();
    let styleTag = shadowRoot.querySelector('#relato-theme-vars');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'relato-theme-vars';
      shadowRoot.prepend(styleTag);
    }
    styleTag.textContent = `:host, :host *, .panel, .relato-address-popup, .relato-popup { ${buildCssVariables(colors)} }`;
    return colors;
  }

  /**
   * Inicia observador para atualizar tema caso o SADE alterne dinamicamente
   */
  function watchThemeChanges(shadowRoot, callback) {
    let currentDark = detectIsDark();
    const update = () => {
      const nowDark = detectIsDark();
      if (nowDark !== currentDark) {
        currentDark = nowDark;
        const colors = applyTheme(shadowRoot);
        if (typeof callback === 'function') callback(colors);
      }
    };

    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'theme', 'style'] });
    if (document.body) {
      obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'theme', 'style'] });
    }

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
    }

    return () => obs.disconnect();
  }

  root.RelatoSadeTheme = {
    PALETTES,
    detectIsDark,
    extractSadeColors,
    buildCssVariables,
    applyTheme,
    apply: applyTheme,
    watchThemeChanges
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
