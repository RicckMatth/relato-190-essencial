/**
 * here-service.js — Cliente e Normalizador HERE Technologies v7 para Relato 190 (v5.8.0)
 * Integra Autosuggest, Autocomplete e Geocoding com proteção de privacidade operacional,
 * controle de concorrência via AbortController, tratamento de 429/503 e modo mock seguro.
 */
(function (root) {
  'use strict';

  // ── Coordenadas Centrais de Referência (Paraná) ───────────────────────────
  const CITY_CENTROIDS = {
    'colombo': { lat: -25.2917, lon: -49.2242 },
    'curitiba': { lat: -25.4284, lon: -49.2733 },
    'pinhais': { lat: -25.4439, lon: -49.1911 },
    'sao jose dos pinhais': { lat: -25.5347, lon: -49.2064 },
    'piraquara': { lat: -25.4422, lon: -49.0628 },
    'almirante tamandare': { lat: -25.3214, lon: -49.3006 },
    'araucaria': { lat: -25.5925, lon: -49.4103 },
    'campo largo': { lat: -25.4597, lon: -49.5275 },
    'fazenda rio grande': { lat: -25.6592, lon: -49.3092 },
    'quatro barras': { lat: -25.3656, lon: -49.0769 },
    'campina grande do sul': { lat: -25.3053, lon: -49.0558 },
    'paranagua': { lat: -25.5205, lon: -48.5092 },
    'ponta grossa': { lat: -25.0994, lon: -50.1583 },
    'londrina': { lat: -23.3045, lon: -51.1696 },
    'maringa': { lat: -23.4205, lon: -51.9333 },
    'cascavel': { lat: -24.9578, lon: -53.4595 },
    'foz do iguacu': { lat: -25.5163, lon: -54.5854 },
    'guarapuava': { lat: -25.3907, lon: -51.4628 },
    '_pr': { lat: -25.2521, lon: -52.0215 } // Centroide geográfico do estado do Paraná
  };

  // ── Base de Demonstração / Mock Realista para Testes Fictícios ───────────
  // Utilizada quando não houver chave real configurada ou em ambiente de teste/simulador.
  const MOCK_STREET_DATABASE = [
    { street: 'Rua Cecília Meireles', city: 'Colombo', state: 'PR', district: 'Guarani', postalCode: '83409-270' },
    { street: 'Rua Cecília Meireles', city: 'Curitiba', state: 'PR', district: 'Batel', postalCode: '80240-000' },
    { street: 'Rua Ataulfo Alves', city: 'Colombo', state: 'PR', district: 'Alto da Cruz', postalCode: '83407-120' },
    { street: 'Rua das Flores', city: 'Colombo', state: 'PR', district: 'Bairro Demonstrativo', postalCode: '83400-010' },
    { street: 'Rua Fictícia do Bosque', city: 'Colombo', state: 'PR', district: 'Bairro Demonstrativo', postalCode: '83400-069' },
    { street: 'Rua São Pedro', city: 'Colombo', state: 'PR', district: 'São Gabriel', postalCode: '83406-000' },
    { street: 'Avenida Brasil', city: 'Colombo', state: 'PR', district: 'Rio Verde', postalCode: '83405-000' },
    { street: 'Rua Marechal Deodoro', city: 'Colombo', state: 'PR', district: 'Centro', postalCode: '83401-000' },
    { street: 'Rua XV de Novembro', city: 'Colombo', state: 'PR', district: 'Centro', postalCode: '83401-020' },
    { street: 'Rua XV de Novembro', city: 'Curitiba', state: 'PR', district: 'Centro', postalCode: '80020-310' },
    { street: 'Rua Marechal Deodoro', city: 'Curitiba', state: 'PR', district: 'Centro', postalCode: '80010-010' },
    { street: 'Avenida Sete de Setembro', city: 'Curitiba', state: 'PR', district: 'Batel', postalCode: '80240-000' },
    { street: 'Rua Professor Pedro Viriato Parigot de Souza', city: 'Curitiba', state: 'PR', district: 'Campina do Siqueira', postalCode: '81200-100' },
    { street: 'Rua Jacob Macanhan', city: 'Pinhais', state: 'PR', district: 'Pineville', postalCode: '83324-000' },
    { street: 'Avenida Iraí', city: 'Pinhais', state: 'PR', district: 'Vargem Grande', postalCode: '83321-000' },
    { street: 'Rua Joinville', city: 'São José dos Pinhais', state: 'PR', district: 'São Pedro', postalCode: '83005-550' }
  ];

  /**
   * Sanitiza strings de busca (remove caracteres perigosos, limita a 100 caracteres)
   */
  function cleanQuery(v) {
    return String(v ?? '').replace(/[\u0000-\u001f<>"{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function norm(v) {
    return cleanQuery(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(r\.?|rua|avenida|av\.?|travessa|tv\.?|alameda|al\.?)\b/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Obtém o ponto central de referência para o município informado
   */
  function getCityCentroid(cityName) {
    const key = norm(cityName);
    return CITY_CENTROIDS[key] || CITY_CENTROIDS['_pr'];
  }

  /**
   * Executa busca simulada offline / demonstrativa de alta fidelidade
   */
  function searchMock(query, targetCity = '', targetDistrict = '') {
    const qNorm = norm(query);
    const cNorm = norm(targetCity);
    const matcher = root.Relato190Address;

    if (!qNorm || qNorm.length < 2) return [];

    const candidates = [];
    for (const record of MOCK_STREET_DATABASE) {
      const sNorm = norm(record.street);
      const recCityNorm = norm(record.city);
      const isSameCity = !cNorm || recCityNorm === cNorm;

      // Calcular pontuação de similaridade fonética e de grafia
      const matchScore = matcher ? matcher.score(query, record.street) : (sNorm.includes(qNorm) ? 90 : 50);

      if (matchScore >= 40 || sNorm.includes(qNorm) || qNorm.includes(sNorm)) {
        // Classificar tipo de correspondência
        let matchType = 'similar';
        if (sNorm === qNorm) matchType = 'exact';
        else if (!isSameCity) matchType = 'different_city';

        // Checar divergência de bairro se o operador informou bairro
        let districtDivergence = false;
        if (targetDistrict && record.district) {
          const dScore = matcher ? matcher.score(targetDistrict, record.district) : 50;
          if (dScore < 65 && norm(targetDistrict) !== norm(record.district)) {
            districtDivergence = true;
          }
        }

        // Bônus de relevância para o município que o operador já informou
        const finalScore = matchScore + (isSameCity ? 15 : -25);

        candidates.push({
          title: record.street,
          street: record.street,
          city: record.city,
          state: record.state,
          district: record.district,
          postalCode: record.postalCode,
          source: 'HERE Technologies (Simulado)',
          isSameCity,
          divergentCity: !isSameCity ? `${record.city}/${record.state}` : null,
          districtDivergence,
          matchType,
          score: Math.max(0, Math.min(100, finalScore))
        });
      }
    }

    // Ordenar: primeiro mesma cidade com maior score, depois cidades vizinhas
    candidates.sort((a, b) => b.score - a.score || a.street.localeCompare(b.street, 'pt-BR'));
    return candidates.slice(0, 5);
  }

  /**
   * Consulta pública gratuita e oficial ViaCEP para busca de logradouro por município
   */
  async function searchViaCep(query, targetCity = '', signal = null) {
    const qClean = cleanQuery(query);
    if (!qClean || qClean.length < 3) return [];
    const city = targetCity ? cleanQuery(targetCity) : 'Colombo';
    const state = 'PR';

    // Remover prefixos como "rua ", "av. ", etc. para viabilizar busca no ViaCEP
    const stripped = qClean.replace(/^\s*(r\.?|rua|avenida|av\.?|travessa|tv\.?|alameda|al\.?|rodovia|rod\.?|estrada|est\.?|praca|praça|pc\.?)\s+/i, '').trim();
    const queryTerm = stripped.length >= 3 ? stripped : qClean;

    const url = `https://viacep.com.br/ws/${state}/${encodeURIComponent(city)}/${encodeURIComponent(queryTerm)}/json/`;
    try {
      const resp = await fetch(url, {
        method: 'GET',
        signal,
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) return [];

      const matcher = root.Relato190Address;
      const results = [];
      for (const item of data) {
        const street = item.logradouro || '';
        if (!street) continue;
        const score = matcher ? matcher.score(query, street) : 90;
        results.push({
          title: street,
          street,
          city: item.localidade || city,
          state: item.uf || 'PR',
          district: item.bairro || '',
          postalCode: item.cep || '',
          source: 'ViaCEP / Correios (Oficial)',
          isSameCity: norm(item.localidade) === norm(city),
          divergentCity: null,
          districtDivergence: false,
          matchType: norm(street) === norm(query) ? 'exact' : 'similar',
          score
        });
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, 5);
    } catch (_) {
      return [];
    }
  }

  // ── Classe Principal HereService ──────────────────────────────────────────
  class HereService {
    constructor(config = {}) {
      this.apiKey = config.apiKey || '';
      this.proxyUrl = config.proxyUrl || '';
      this.useMock = config.useMock !== false && !this.apiKey && !this.proxyUrl;
      this.activeController = null;
      this.cache = new Map(); // Cache transitório em memória (tempo de vida 30s)
    }

    /**
     * Atualiza credenciais em tempo de execução
     */
    configure({ apiKey, proxyUrl, useMock }) {
      if (apiKey !== undefined) this.apiKey = String(apiKey || '').trim();
      if (proxyUrl !== undefined) this.proxyUrl = String(proxyUrl || '').trim();
      if (useMock !== undefined) this.useMock = !!useMock;
      this.cache.clear();
    }

    /**
     * Autosuggest principal com tolerância a erros e contexto geográfico
     */
    async autosuggest(query, context = {}) {
      const q = cleanQuery(query);
      const city = cleanQuery(context.cidade || context.city || '');
      const district = cleanQuery(context.bairro || context.district || '');

      if (!q || q.length < 2) return [];

      // Checar cache de memória
      const cacheKey = `${norm(city)}:${norm(q)}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.time < 30000) {
        return cached.results;
      }

      // Se há chave HERE configurada e não está em modo estritamente mock
      if (!this.useMock && (this.apiKey || this.proxyUrl)) {
        if (this.activeController) {
          try { this.activeController.abort(); } catch (_) {}
        }
        this.activeController = new AbortController();
        const signal = this.activeController.signal;

        const centroid = getCityCentroid(city);
        const endpoint = this.proxyUrl || 'https://autosuggest.search.hereapi.com/v1/autosuggest';
        const url = new URL(endpoint);

        if (!this.proxyUrl) {
          url.searchParams.set('apiKey', this.apiKey);
          url.searchParams.set('q', q);
          url.searchParams.set('at', `${centroid.lat},${centroid.lon}`);
          url.searchParams.set('in', 'countryCode:BRA');
          url.searchParams.set('types', 'address,street');
          url.searchParams.set('limit', '5');
          url.searchParams.set('lang', 'pt-BR');
        } else {
          url.searchParams.set('q', q);
          if (city) url.searchParams.set('city', city);
        }

        const timeoutId = setTimeout(() => {
          try { this.activeController.abort(); } catch (_) {}
        }, 6500);

        try {
          const resp = await fetch(url.toString(), {
            method: 'GET',
            signal,
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
          });

          clearTimeout(timeoutId);

          if (resp.status === 429) {
            console.warn('Limite HERE excedido (HTTP 429), caindo para fallback oficial.');
          } else if (resp.ok) {
            const data = await resp.json();
            const items = data.items || [];
            if (items.length > 0) {
              const normalized = this.normalizeResults(items, q, city, district);
              normalized.items = normalized;
              normalized.mock = false;
              this.cache.set(cacheKey, { time: Date.now(), results: normalized });
              return normalized;
            }
          }
        } catch (err) {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') return [];
        }
      }

      // Fallback 1: Consulta oficial pública ViaCEP por município (Paraná / Brasil)
      if (q.length >= 3) {
        try {
          const viaResults = await searchViaCep(q, city);
          if (viaResults && viaResults.length > 0) {
            viaResults.items = viaResults;
            viaResults.mock = false;
            this.cache.set(cacheKey, { time: Date.now(), results: viaResults });
            return viaResults;
          }
        } catch (_) {}
      }

      // Fallback 2: Busca heurística local / Mock offline enriquecido
      const mockResults = searchMock(q, city, district);
      mockResults.items = mockResults;
      mockResults.mock = true;
      this.cache.set(cacheKey, { time: Date.now(), results: mockResults });
      return mockResults;
    }

    /**
     * Normaliza a resposta bruta da API HERE v7 para o formato padronizado
     */
    normalizeResults(items, query, targetCity, targetDistrict) {
      const matcher = root.Relato190Address;
      const cNorm = norm(targetCity);
      const results = [];

      for (const item of items) {
        const addr = item.address || {};
        const street = addr.street || item.title || '';
        const city = addr.city || addr.county || '';
        const state = addr.stateCode || addr.state || 'PR';
        const district = addr.district || addr.subdistrict || '';
        const postalCode = addr.postalCode || '';

        if (!street) continue;

        const recCityNorm = norm(city);
        const isSameCity = !cNorm || recCityNorm === cNorm;
        const matchScore = matcher ? matcher.score(query, street) : 75;

        let matchType = 'similar';
        if (norm(street) === norm(query)) matchType = 'exact';
        else if (!isSameCity) matchType = 'different_city';

        let districtDivergence = false;
        if (targetDistrict && district) {
          const dScore = matcher ? matcher.score(targetDistrict, district) : 50;
          if (dScore < 65 && norm(targetDistrict) !== norm(district)) {
            districtDivergence = true;
          }
        }

        results.push({
          title: street,
          street,
          city,
          state,
          district,
          postalCode,
          source: 'HERE Technologies',
          isSameCity,
          divergentCity: !isSameCity ? `${city}/${state}` : null,
          districtDivergence,
          matchType,
          score: matchScore + (isSameCity ? 10 : -20)
        });
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, 5);
    }
  }

  root.Relato190Here = {
    HereService,
    getCityCentroid,
    searchMock,
    CITY_CENTROIDS
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
