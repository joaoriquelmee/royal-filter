// ==UserScript==
// @name         Royal Filter
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Filtro de turmas para o Letzplay - Royal Tênis Clube
// @author       Riquelme
// @match        https://letzplay.me/places/royal/schedules/by_day/*/*
// @match        https://letzplay.me/places/royal/schedules/by_day/*
// @updateURL    https://raw.githubusercontent.com/joaoriquelmee/royal-filter/main/filter.user.js
// @downloadURL  https://raw.githubusercontent.com/joaoriquelmee/royal-filter/main/filter.user.js
// @grant        none
// ==/UserScript==

(function () {

  const LIMITE_FIXOS = 4;
  let estadoOriginal = [];
  let painelMontado = false;

  function salvarEstadoOriginal() {
    estadoOriginal = [];
    document.querySelectorAll('.schedule-event').forEach(ev => {
      estadoOriginal.push({ el: ev, display: ev.style.display });
    });
  }

  function restaurarTudo() {
    estadoOriginal.forEach(({ el, display }) => {
      el.style.display = display;
      const badge = el.querySelector('.badge-vagas-letz');
      if (badge) badge.remove();
    });
    resetarRelatorio();
  }

  function resetarRelatorio() {
    const textarea = document.getElementById('rf-relatorio-texto');
    const btnCopiar = document.getElementById('rf-btn-copiar');
    if (textarea) { textarea.value = ''; textarea.style.display = 'none'; }
    if (btnCopiar) { btnCopiar.textContent = '📋 Copiar texto'; btnCopiar.style.display = 'none'; }
  }

  function ehAula(evento) {
    const conteudo = evento.querySelector('.schedule-event-content');
    if (!conteudo) return false;
    if (!conteudo.querySelector('.fa-graduation-cap')) return false;
    const classesBloqueadas = [
      'schedule-red', 'schedule-purple',
      'schedule-cluborlocation', 'schedule-dark-red'
    ];
    for (const cls of classesBloqueadas) {
      if (conteudo.classList.contains(cls)) return false;
    }
    return true;
  }

  function getLimiteKids(evento) {
    const titulo = getTituloTurma(evento);
    if (titulo.includes('vermelha')) return 8;
    if (titulo.includes('laranja'))  return 6;
    if (titulo.includes('verde'))    return 6;
    if (titulo.includes('amarela'))  return 4;
    return 8;
  }

  function contarAlunos(conteudo) {
    const labels = conteudo.querySelectorAll(
      'span.schedule-event-content-many-people small span.label, span small span.label'
    );
    const tipos = [];
    labels.forEach(l => tipos.push(l.textContent.trim()));

    const totalSistema = parseInt(
      (conteudo.querySelector('small.label.label-default.pull-right') || {}).textContent || '0'
    );

    const naoFixos = tipos.filter(t => ['R', 'A', 'T'].includes(t)).length;
    const faltantes = tipos.filter(t => ['F', 'FR'].includes(t)).length;
    const totalFixos = totalSistema - naoFixos;
    const vagasFixas = Math.max(0, LIMITE_FIXOS - totalFixos);
    const vagasDia = Math.max(0, vagasFixas + faltantes);
    const temExperimental = tipos.includes('T');

    return { vagasFixas, vagasDia, faltantes, temExperimental };
  }

  function contarAlunosKids(conteudo, limiteKids) {
    const labels = conteudo.querySelectorAll(
      'span.schedule-event-content-many-people small span.label, span small span.label'
    );
    const tipos = [];
    labels.forEach(l => tipos.push(l.textContent.trim()));

    const totalSistema = parseInt(
      (conteudo.querySelector('small.label.label-default.pull-right') || {}).textContent || '0'
    );

    const naoFixos = tipos.filter(t => ['R', 'A', 'T'].includes(t)).length;
    const faltantes = tipos.filter(t => ['F', 'FR'].includes(t)).length;
    const totalFixos = totalSistema - naoFixos;
    const vagasFixas = Math.max(0, limiteKids - totalFixos);
    const vagasDia = Math.max(0, vagasFixas + faltantes);

    return { vagasFixas, vagasDia };
  }

  function getProfessor(evento) {
    const spanManyPeople = evento.querySelector('.schedule-event-content-many-people b');
    if (spanManyPeople) return spanManyPeople.textContent.replace(/\s+/g, ' ').trim();
    const spanGenerico = evento.querySelector('.schedule-event-content span b');
    if (spanGenerico) return spanGenerico.textContent.replace(/\s+/g, ' ').trim();
    return null;
  }

  const QUADRAS_COBERTAS    = ['9495', '9496', '15112'];
  const QUADRAS_DESCOBERTAS = ['9497', '15113'];

  function getCourtId(evento) {
    const link = evento.querySelector('a[href*="court_id="]');
    if (!link) return null;
    const match = link.getAttribute('href').match(/court_id=(\d+)/);
    return match ? match[1] : null;
  }

  function getTipoQuadra(evento) {
    const courtId = getCourtId(evento);
    if (!courtId) return null;
    if (QUADRAS_COBERTAS.includes(courtId)) return 'coberta';
    if (QUADRAS_DESCOBERTAS.includes(courtId)) return 'descoberta';
    return null;
  }

  function ehBeneficio(evento) {
    const conteudo = evento.querySelector('.schedule-event-content');
    if (!conteudo) return false;
    return conteudo.classList.contains('schedule-purple');
  }

  function getPrimeiroNome(nomeCompleto) {
    if (!nomeCompleto) return null;
    const primeiro = nomeCompleto.split(' ')[0];
    const apelidos = { 'Vitorino': 'Birinha', 'João': 'JP' };
    return apelidos[primeiro] || primeiro;
  }

  function marginTopParaHora(marginTopPx) {
    const px = parseInt(marginTopPx);
    if (isNaN(px)) return null;
    const horasApos5 = (px - 98) / 96;
    if (horasApos5 % 1 !== 0) return null;
    return 5 + horasApos5;
  }

  function getDataFormatada() {
    const match = window.location.pathname.match(/by_day\/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}`;
    return '';
  }

  function gerarRelatorio(turno) {
    const horaInicio = turno === 'manha' ? 6 : 14;
    const horaFim    = turno === 'manha' ? 13 : 23;
    const mapaHoras = {};
    for (let h = horaInicio; h <= horaFim; h++) mapaHoras[h] = new Set();

    document.querySelectorAll('.schedule-event').forEach(evento => {
      if (!ehAula(evento)) return;
      const hora = marginTopParaHora(evento.style.marginTop);
      if (hora === null || hora < horaInicio || hora > horaFim) return;
      const primeiroNome = getPrimeiroNome(getProfessor(evento));
      if (primeiroNome) mapaHoras[hora].add(primeiroNome);
    });

    const data = getDataFormatada();
    const turnoLabel = turno === 'manha' ? 'Manhã' : 'Tarde';
    let texto = `RELATÓRIO DE PRESENÇA DOS PROFESSORES 📊\nDia: ${data}\n\nTurno ${turnoLabel}:  ✅❌`;
    for (let h = horaInicio; h <= horaFim; h++) {
      const professores = Array.from(mapaHoras[h]);
      if (professores.length === 0) continue;
      texto += `\n\n${h}h\n` + professores.join('\n');
    }
    return texto.trim();
  }

  function coletarProfessores() {
    const set = new Set();
    document.querySelectorAll('.schedule-event').forEach(ev => {
      if (!ehAula(ev)) return;
      const prof = getProfessor(ev);
      if (prof) set.add(prof);
    });
    return Array.from(set).sort();
  }

  const CATEGORIAS_ADULTAS = [
    { id: 'zero',    label: '6° Zero',    cor: '#d5fca9', textoCor: '#1e2d3d' },
    { id: 'pratica', label: '6° Prática', cor: '#d5fca9', textoCor: '#1e2d3d' },
    { id: '5',       label: '5°',         cor: '#9cc96b', textoCor: '#1e2d3d' },
    { id: '4',       label: '4°',         cor: '#006400', textoCor: '#ffffff' },
    { id: '3',       label: '3°',         cor: '#a4eafc', textoCor: '#1e2d3d' },
    { id: '2',       label: '2°',         cor: '#720EED', textoCor: '#ffffff' },
    { id: '1',       label: '1°',         cor: '#690303', textoCor: '#ffffff' }
  ];

  const CATEGORIAS_KIDS = [
    { id: 'kids',     label: 'Kids',        cor: '#092FE8', textoCor: '#ffffff' },
    { id: 'vermelha', label: 'B. Vermelha', cor: '#E80C0C', textoCor: '#ffffff' },
    { id: 'laranja',  label: 'B. Laranja',  cor: '#F56C05', textoCor: '#ffffff' },
    { id: 'verde',    label: 'B. Verde',    cor: '#50F705', textoCor: '#1e2d3d' }
  ];

  function getTituloTurma(evento) {
    return (evento.getAttribute('data-original-title') || '').toLowerCase();
  }

  function getCategorias(evento) {
    const titulo = getTituloTurma(evento);
    const categorias = [];
    const ehKids = titulo.includes('kids') || titulo.includes('baby kids');
    if (ehKids) {
      categorias.push('kids');
      if (titulo.includes('vermelha')) categorias.push('vermelha');
      if (titulo.includes('laranja'))  categorias.push('laranja');
      if (titulo.includes('verde'))    categorias.push('verde');
      return categorias;
    }
    if (titulo.includes('6°') || titulo.includes('6º') || titulo.includes('estreante')) {
      categorias.push(titulo.includes('zero') ? 'zero' : 'pratica');
      return categorias;
    }
    const matchClasse = titulo.match(/([1-5])\s*[°º]/);
    if (matchClasse) { categorias.push(matchClasse[1]); return categorias; }
    return categorias;
  }

  function ehTurmaKids(evento) {
    const cats = getCategorias(evento);
    return cats.some(c => ['kids','vermelha','laranja','verde'].includes(c));
  }

  function coletarCategoriasPresentes() {
    const presentes = new Set();
    document.querySelectorAll('.schedule-event').forEach(ev => {
      if (!ehAula(ev)) return;
      getCategorias(ev).forEach(c => presentes.add(c));
    });
    return presentes;
  }

  function adicionarBadge(conteudo, vagasFixas, vagasDia) {
    const antigo = conteudo.querySelector('.badge-vagas-letz');
    if (antigo) antigo.remove();

    let txt = '', cor = '';
    if (vagasFixas > 0) {
      txt = `✅ ${vagasFixas} VF`;
      cor = 'rgba(39,174,96,0.93)';
    } else if (vagasDia > 0) {
      txt = `⏳ ${vagasDia} VT`;
      cor = 'rgba(230,126,34,0.93)';
    }
    if (!txt) return;

    const badge = document.createElement('span');
    badge.className = 'badge-vagas-letz';
    badge.style.cssText = `display:inline-block;font-size:8px;font-weight:bold;color:#fff;background:${cor};padding:1px 3px;border-radius:3px;line-height:1.3;pointer-events:none;margin-left:4px;vertical-align:middle;white-space:nowrap;`;
    badge.textContent = txt;

    const negrito = conteudo.querySelector('.schedule-event-content-many-people b, span > b');
    if (negrito) {
      const brInterno = negrito.querySelector('br');
      if (brInterno) brInterno.insertAdjacentElement('beforebegin', badge);
      else negrito.appendChild(badge);
    } else {
      badge.style.position = 'absolute';
      badge.style.bottom = '1px';
      badge.style.left = '1px';
      conteudo.style.position = 'relative';
      conteudo.appendChild(badge);
    }
  }

  function aplicarFiltros() {
    restaurarTudo();

    const mostrarComVaga      = document.getElementById('rf-chk-vaga')?.checked;
    const mostrarExperimental = document.getElementById('rf-chk-exp')?.checked;
    const mostrarLocacao      = document.getElementById('rf-chk-locacao')?.checked;
    const mostrarCoberta      = document.getElementById('rf-chk-coberta')?.checked;
    const mostrarDescoberta   = document.getElementById('rf-chk-descoberta')?.checked;
    const mostrarBeneficio    = document.getElementById('rf-chk-beneficio')?.checked;
    const professoresSelecionados = Array.from(document.querySelectorAll('.rf-chk-prof:checked')).map(el => el.value);
    const filtraProfessor = professoresSelecionados.length > 0;
    const horasSelecionadas = Array.from(document.querySelectorAll('.rf-pill-hora.ativa')).map(el => parseInt(el.dataset.hora));
    const filtraHorario = horasSelecionadas.length > 0;
    const filtraQuadra = mostrarCoberta || mostrarDescoberta;
    const categoriasSelecionadas = Array.from(document.querySelectorAll('.rf-pill-categoria.ativa')).map(el => el.dataset.categoria);
    const filtraCategoria = categoriasSelecionadas.length > 0;

    if (!mostrarComVaga && !mostrarExperimental && !mostrarLocacao && !mostrarBeneficio
        && !filtraProfessor && !filtraHorario && !filtraQuadra && !filtraCategoria) return;

    if (mostrarBeneficio) {
      document.querySelectorAll('.schedule-event').forEach(evento => {
        const conteudo = evento.querySelector('.schedule-event-content');
        if (!conteudo) { evento.style.display = 'none'; return; }
        let passaHorario = true;
        if (filtraHorario) {
          const h = marginTopParaHora(evento.style.marginTop);
          passaHorario = h !== null && horasSelecionadas.includes(h);
        }
        evento.style.display = (ehBeneficio(evento) && passaHorario) ? '' : 'none';
      });
      return;
    }

    if (mostrarLocacao && filtraHorario) {
      document.querySelectorAll('.schedule-event').forEach(evento => {
        const conteudo = evento.querySelector('.schedule-event-content');
        if (!conteudo) { evento.style.display = 'none'; return; }
        const eLocacao = conteudo.classList.contains('schedule-cluborlocation');
        const h = marginTopParaHora(evento.style.marginTop);
        evento.style.display = (eLocacao && h !== null && horasSelecionadas.includes(h)) ? '' : 'none';
      });
      return;
    }

    document.querySelectorAll('.schedule-event').forEach(evento => {
      const conteudo = evento.querySelector('.schedule-event-content');
      if (!conteudo) { evento.style.display = 'none'; return; }

      const eLocacao = conteudo.classList.contains('schedule-cluborlocation');
      if (mostrarLocacao) { evento.style.display = eLocacao ? '' : 'none'; return; }
      if (eLocacao) { evento.style.display = 'none'; return; }
      if (!ehAula(evento)) { evento.style.display = 'none'; return; }

      const cancelado = evento.classList.contains('schedule-canceled') || conteudo.classList.contains('schedule-canceled');
      if (cancelado) { evento.style.display = 'none'; return; }

      const eKids = ehTurmaKids(evento);
      const { vagasFixas, vagasDia, temExperimental } = contarAlunos(conteudo);
      const professor = getProfessor(evento);

      if (filtraProfessor && !(professor !== null && professoresSelecionados.includes(professor))) { evento.style.display = 'none'; return; }

      if (filtraHorario) {
        const h = marginTopParaHora(evento.style.marginTop);
        if (h === null || !horasSelecionadas.includes(h)) { evento.style.display = 'none'; return; }
      }

      if (filtraQuadra) {
        const tipo = getTipoQuadra(evento);
        if (mostrarCoberta && tipo !== 'coberta') { evento.style.display = 'none'; return; }
        if (mostrarDescoberta && tipo !== 'descoberta') { evento.style.display = 'none'; return; }
      }

      if (filtraCategoria) {
        const cats = getCategorias(evento);
        if (!cats.some(c => categoriasSelecionadas.includes(c))) { evento.style.display = 'none'; return; }
      }

      let deveExibir = false;
      if (!mostrarComVaga && !mostrarExperimental) {
        deveExibir = true;
      } else {
        if (mostrarExperimental && temExperimental) deveExibir = true;
        if (mostrarComVaga) {
          if (eKids) {
            const lim = getLimiteKids(evento);
            const kv = contarAlunosKids(conteudo, lim);
            if (kv.vagasFixas > 0 || kv.vagasDia > 0) deveExibir = true;
          } else {
            if (vagasFixas > 0 || vagasDia > 0) deveExibir = true;
          }
        }
      }

      if (deveExibir) {
        evento.style.display = '';
        if (mostrarComVaga) {
          if (eKids) {
            const lim = getLimiteKids(evento);
            const kv = contarAlunosKids(conteudo, lim);
            adicionarBadge(conteudo, kv.vagasFixas, kv.vagasDia);
          } else {
            adicionarBadge(conteudo, vagasFixas, vagasDia);
          }
        }
      } else {
        evento.style.display = 'none';
      }
    });
  }

  const LOGO_URL = 'https://raw.githubusercontent.com/joaoriquelmee/royal-filter/main/assets/royal-filter-icon.png';

  function criarIcone() {
    const antigo = document.getElementById('royal-filter-icone');
    if (antigo) antigo.remove();

    const icone = document.createElement('div');
    icone.id = 'royal-filter-icone';
    icone.style.cssText = 'position:fixed;top:100px;right:16px;width:76px;height:76px;background:#1e2d3d;border:3px solid #3d5a73;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 4px 14px rgba(0,0,0,0.5);z-index:100000;cursor:grab;user-select:none;overflow:hidden;';

    const img = document.createElement('img');
    img.src = LOGO_URL;
    img.alt = 'Royal Filter';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none;user-select:none;';
    img.onerror = () => { icone.textContent = '👑'; };
    icone.appendChild(img);
    document.body.appendChild(icone);

    let arrastando = false, moveu = false, startX, startY, startLeft, startTop;
    icone.addEventListener('mousedown', (e) => {
      arrastando = true; moveu = false;
      startX = e.clientX; startY = e.clientY;
      const rect = icone.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      icone.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!arrastando) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moveu = true;
      icone.style.right = 'auto';
      icone.style.left = `${startLeft + dx}px`;
      icone.style.top = `${startTop + dy}px`;
    });
    document.addEventListener('mouseup', () => {
      if (arrastando && !moveu) {
        icone.style.display = 'none';
        if (!painelMontado) { montarPainel(); painelMontado = true; }
        else { const p = document.getElementById('royal-filter-painel'); if (p) p.style.display = ''; }
      }
      arrastando = false;
      icone.style.cursor = 'grab';
    });
  }

  function mostrarIcone() {
    const icone = document.getElementById('royal-filter-icone');
    if (icone) icone.style.display = 'flex';
  }

  function montarPainel() {
    const antigo = document.getElementById('royal-filter-painel');
    if (antigo) antigo.remove();

    const professores = coletarProfessores();
    const categoriasPresentes = coletarCategoriasPresentes();

    const painel = document.createElement('div');
    painel.id = 'royal-filter-painel';
    painel.style.cssText = 'position:fixed;top:80px;right:16px;z-index:99999;width:240px;background:#1e2d3d;color:#ecf0f1;border-radius:14px;padding:16px;font-family:\'Segoe UI\',sans-serif;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,0.5);max-height:85vh;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#3d5a73 #1e2d3d;cursor:default;';

    painel.innerHTML = `
      <div id="rf-header" style="position:relative;display:flex;align-items:center;justify-content:center;cursor:grab;user-select:none;padding-bottom:8px">
        <span style="font-size:15px;font-weight:700;letter-spacing:1px">👑 Royal Filter</span>
        <button id="rf-btn-minimizar" style="position:absolute;right:0;top:50%;transform:translateY(-50%);background:none;border:1px solid #3d5a73;color:#95a5a6;border-radius:5px;padding:1px 7px;cursor:pointer;font-size:11px;line-height:1.4;">▼</button>
      </div>
      <div id="rf-subtitulo" style="text-align:center;font-size:10px;color:#f39c12;margin-bottom:12px">⚠️ Em desenvolvimento</div>
      <hr id="rf-hr-header" style="border-color:rgba(255,255,255,0.1);margin-bottom:12px">
      <div id="rf-corpo">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#95a5a6;margin-bottom:8px;letter-spacing:.5px">Visualização</div>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="rf-chk-vaga" style="accent-color:#27ae60;width:14px;height:14px;flex-shrink:0"><span style="white-space:nowrap;font-size:12px">Turmas com vagas ✅</span></label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="rf-chk-exp" style="accent-color:#8e44ad;width:14px;height:14px;flex-shrink:0"><span style="white-space:nowrap;font-size:12px">Aulas com Experimentais 🧪</span></label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="rf-chk-locacao" style="accent-color:#e67e22;width:14px;height:14px;flex-shrink:0"><span style="white-space:nowrap;font-size:12px">Horários para Locação 🤑</span></label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="rf-chk-coberta" style="accent-color:#16a085;width:14px;height:14px;flex-shrink:0"><span style="white-space:nowrap;font-size:12px">Turmas em Coberta 🏠</span></label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="rf-chk-descoberta" style="accent-color:#16a085;width:14px;height:14px;flex-shrink:0"><span style="white-space:nowrap;font-size:12px">Turmas em Descoberta ☀️</span></label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="rf-chk-beneficio" style="accent-color:#9b59b6;width:14px;height:14px;flex-shrink:0"><span style="white-space:nowrap;font-size:12px">Reserva de Benefício 🎁</span></label>
        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#95a5a6;letter-spacing:.5px">Por Categoria</div>
          <button id="rf-btn-toggle-categorias" style="background:none;border:1px solid #3d5a73;color:#95a5a6;border-radius:5px;padding:2px 7px;cursor:pointer;font-size:11px;">▼ Mostrar</button>
        </div>
        <div id="rf-lista-categorias" style="display:none">
          <div id="rf-titulo-adultas" style="font-size:10px;font-weight:600;text-transform:uppercase;margin-bottom:6px;letter-spacing:.5px">CATEGORIAS ADULTAS</div>
          <div id="rf-pills-adultas" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px"></div>
          <div id="rf-titulo-kids" style="font-size:10px;font-weight:600;text-transform:uppercase;margin-bottom:6px;letter-spacing:.5px">TURMAS KIDS</div>
          <div id="rf-pills-kids" style="display:flex;flex-wrap:wrap;gap:5px"></div>
        </div>
        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#95a5a6;letter-spacing:.5px">Por Professor</div>
          <button id="rf-btn-toggle-profs" style="background:none;border:1px solid #3d5a73;color:#95a5a6;border-radius:5px;padding:2px 7px;cursor:pointer;font-size:11px;">▼ Mostrar</button>
        </div>
        <div id="rf-lista-profs" style="display:none;max-height:180px;overflow-y:auto;padding-right:4px;scrollbar-width:thin;scrollbar-color:#3d5a73 #1e2d3d;">
          ${professores.map(prof => `<label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;cursor:pointer"><input type="checkbox" class="rf-chk-prof" value="${prof}" style="accent-color:#2980b9;width:13px;height:13px;flex-shrink:0"><span style="font-size:11px">${prof}</span></label>`).join('') || '<span style="color:#7f8c8d;font-size:11px">Nenhum professor encontrado</span>'}
        </div>
        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#95a5a6;letter-spacing:.5px">Por Horário</div>
          <button id="rf-btn-toggle-horas" style="background:none;border:1px solid #3d5a73;color:#95a5a6;border-radius:5px;padding:2px 7px;cursor:pointer;font-size:11px;">▼ Mostrar</button>
        </div>
        <div id="rf-lista-horas" style="display:none;grid-template-columns:repeat(5,1fr);gap:5px;">
          ${Array.from({length:17},(_,i)=>i+6).map(h=>`<button type="button" class="rf-pill-hora" data-hora="${h}" style="background:#2c3e50;border:1px solid #3d5a73;color:#ecf0f1;border-radius:14px;padding:5px 0;cursor:pointer;font-size:11px;font-weight:bold;text-align:center;">${h}h</button>`).join('')}
        </div>
        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#95a5a6;margin-bottom:8px;letter-spacing:.5px">Relatório de Presença</div>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button id="rf-btn-manha" style="flex:1;padding:7px 4px;background:#2980b9;border:none;color:white;border-radius:7px;cursor:pointer;font-size:11px;font-weight:bold">🌅 Manhã</button>
          <button id="rf-btn-tarde" style="flex:1;padding:7px 4px;background:#e67e22;border:none;color:white;border-radius:7px;cursor:pointer;font-size:11px;font-weight:bold">🌆 Tarde</button>
        </div>
        <textarea id="rf-relatorio-texto" style="width:100%;height:120px;background:#0f1c29;color:#ecf0f1;border:1px solid #3d5a73;border-radius:7px;padding:8px;font-size:10px;font-family:monospace;resize:none;box-sizing:border-box;display:none;" readonly></textarea>
        <button id="rf-btn-copiar" style="width:100%;padding:6px;margin-top:6px;background:#16a085;border:none;color:white;border-radius:7px;cursor:pointer;font-size:11px;font-weight:bold;display:none;">📋 Copiar texto</button>
        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">
        <button id="rf-btn-aplicar" style="width:100%;padding:8px;margin-bottom:6px;background:#27ae60;border:none;color:white;border-radius:7px;cursor:pointer;font-size:12px;font-weight:bold">▶ Aplicar filtros</button>
        <button id="rf-btn-restaurar" style="width:100%;padding:8px;background:#c0392b;border:none;color:white;border-radius:7px;cursor:pointer;font-size:12px;font-weight:bold">↩ Restaurar tudo</button>
        <div style="text-align:center;margin-top:14px;font-size:10px;color:#5d7a8a">Desenvolvido por <span id="rf-dev-nome" style="font-weight:700;font-size:11px;letter-spacing:1px;">Riquelme</span></div>
      </div>
    `;

    document.body.appendChild(painel);

    // ─── Neon no nome ────────────────────────────────────────────
    const nomeEl = document.getElementById('rf-dev-nome');
    nomeEl.style.color = '#00f5ff';
    nomeEl.style.textShadow = '0 0 6px #00f5ff, 0 0 12px #00f5ff, 0 0 20px #00c8d4';

    // ─── Títulos das categorias em branco ────────────────────────
    document.getElementById('rf-titulo-adultas').style.color = '#ffffff';
    document.getElementById('rf-titulo-kids').style.color = '#ffffff';

    // ─── Criar pílulas de categoria via DOM ──────────────────────
    // Isso é feito via JS (não template literal) para garantir
    // que as cores são aplicadas corretamente com !important.
    function criarPilulas(containerId, categorias) {
      const container = document.getElementById(containerId);
      categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rf-pill-categoria';
        btn.dataset.categoria = cat.id;
        btn.textContent = cat.label;
        btn.setAttribute('style',
          'background:' + cat.cor + ' !important;' +
          'color:' + cat.textoCor + ' !important;' +
          'border:2px solid rgba(255,255,255,0.2);' +
          'border-radius:14px;padding:5px 10px;cursor:pointer;' +
          'font-size:11px;font-weight:bold;' +
          (categoriasPresentes.has(cat.id) ? '' : 'opacity:0.35;')
        );
        if (!categoriasPresentes.has(cat.id)) btn.title = 'Nenhuma turma dessa categoria hoje';
        container.appendChild(btn);
      });
    }
    criarPilulas('rf-pills-adultas', CATEGORIAS_ADULTAS);
    criarPilulas('rf-pills-kids', CATEGORIAS_KIDS);

    // ─── Clique nas pílulas de categoria ─────────────────────────
    painel.addEventListener('click', (e) => {
      const pill = e.target.closest('.rf-pill-categoria');
      if (!pill) return;
      const ativa = pill.classList.toggle('ativa');
      // Encontra a categoria para saber a cor de texto original
      const catId = pill.dataset.categoria;
      const todasCats = [...CATEGORIAS_ADULTAS, ...CATEGORIAS_KIDS];
      const cat = todasCats.find(c => c.id === catId);
      if (ativa) {
        // Borda branca sólida + zoom, mantém cor de texto
        pill.setAttribute('style',
          'background:' + (cat ? cat.cor : '') + ' !important;' +
          'color:' + (cat ? cat.textoCor : '#fff') + ' !important;' +
          'border:2px solid #ffffff;' +
          'border-radius:14px;padding:5px 10px;cursor:pointer;' +
          'font-size:11px;font-weight:bold;' +
          'box-shadow:0 0 0 1px rgba(255,255,255,0.5),0 2px 6px rgba(0,0,0,0.4);' +
          'transform:scale(1.06);'
        );
      } else {
        pill.setAttribute('style',
          'background:' + (cat ? cat.cor : '') + ' !important;' +
          'color:' + (cat ? cat.textoCor : '#fff') + ' !important;' +
          'border:2px solid rgba(255,255,255,0.2);' +
          'border-radius:14px;padding:5px 10px;cursor:pointer;' +
          'font-size:11px;font-weight:bold;' +
          (categoriasPresentes.has(catId) ? '' : 'opacity:0.35;')
        );
      }
    });

    // ─── Minimizar painel ────────────────────────────────────────
    document.getElementById('rf-btn-minimizar').onclick = (e) => {
      e.stopPropagation();
      painel.style.display = 'none';
      mostrarIcone();
    };

    // ─── Arrastar painel ─────────────────────────────────────────
    const rfHeader = document.getElementById('rf-header');
    const btnMin = document.getElementById('rf-btn-minimizar');
    let arrastando = false, startX, startY, startLeft, startTop;
    rfHeader.addEventListener('mousedown', (e) => {
      if (e.target === btnMin) return;
      arrastando = true;
      startX = e.clientX; startY = e.clientY;
      const rect = painel.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      rfHeader.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!arrastando) return;
      painel.style.right = 'auto';
      painel.style.left = `${startLeft + e.clientX - startX}px`;
      painel.style.top = `${startTop + e.clientY - startY}px`;
    });
    document.addEventListener('mouseup', () => { arrastando = false; rfHeader.style.cursor = 'grab'; });

    // ─── Toggles ─────────────────────────────────────────────────
    const listaProfs = document.getElementById('rf-lista-profs');
    const btnToggleProfs = document.getElementById('rf-btn-toggle-profs');
    btnToggleProfs.onclick = () => {
      const vis = listaProfs.style.display === 'block';
      listaProfs.style.display = vis ? 'none' : 'block';
      btnToggleProfs.textContent = vis ? '▼ Mostrar' : '▲ Ocultar';
    };

    const listaCategorias = document.getElementById('rf-lista-categorias');
    const btnToggleCats = document.getElementById('rf-btn-toggle-categorias');
    btnToggleCats.onclick = () => {
      const vis = listaCategorias.style.display === 'block';
      listaCategorias.style.display = vis ? 'none' : 'block';
      btnToggleCats.textContent = vis ? '▼ Mostrar' : '▲ Ocultar';
    };

    const listaHoras = document.getElementById('rf-lista-horas');
    const btnToggleHoras = document.getElementById('rf-btn-toggle-horas');
    btnToggleHoras.onclick = () => {
      const vis = listaHoras.style.display === 'grid';
      listaHoras.style.display = vis ? 'none' : 'grid';
      btnToggleHoras.textContent = vis ? '▼ Mostrar' : '▲ Ocultar';
    };

    // ─── Pílulas de horário ───────────────────────────────────────
    painel.querySelectorAll('.rf-pill-hora').forEach(pill => {
      pill.onclick = () => {
        const ativa = pill.classList.toggle('ativa');
        pill.style.background = ativa ? '#2980b9' : '#2c3e50';
        pill.style.borderColor = ativa ? '#2980b9' : '#3d5a73';
      };
    });

    // ─── Exclusividade Coberta x Descoberta ──────────────────────
    const chkCoberta = document.getElementById('rf-chk-coberta');
    const chkDescoberta = document.getElementById('rf-chk-descoberta');
    chkCoberta.onchange = () => { if (chkCoberta.checked) chkDescoberta.checked = false; };
    chkDescoberta.onchange = () => { if (chkDescoberta.checked) chkCoberta.checked = false; };

    // ─── Botões principais ───────────────────────────────────────
    document.getElementById('rf-btn-aplicar').onclick = aplicarFiltros;
    document.getElementById('rf-btn-restaurar').onclick = () => {
      restaurarTudo();
      painel.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
      painel.querySelectorAll('.rf-pill-hora.ativa').forEach(pill => {
        pill.classList.remove('ativa');
        pill.style.background = '#2c3e50';
        pill.style.borderColor = '#3d5a73';
      });
      // Resetar pílulas de categoria
      const todasCats = [...CATEGORIAS_ADULTAS, ...CATEGORIAS_KIDS];
      painel.querySelectorAll('.rf-pill-categoria.ativa').forEach(pill => {
        pill.classList.remove('ativa');
        const cat = todasCats.find(c => c.id === pill.dataset.categoria);
        pill.setAttribute('style',
          'background:' + (cat ? cat.cor : '') + ' !important;' +
          'color:' + (cat ? cat.textoCor : '#fff') + ' !important;' +
          'border:2px solid rgba(255,255,255,0.2);' +
          'border-radius:14px;padding:5px 10px;cursor:pointer;' +
          'font-size:11px;font-weight:bold;' +
          (categoriasPresentes.has(pill.dataset.categoria) ? '' : 'opacity:0.35;')
        );
      });
    };

    // ─── Relatório ───────────────────────────────────────────────
    const textarea = document.getElementById('rf-relatorio-texto');
    const btnCopiar = document.getElementById('rf-btn-copiar');
    document.getElementById('rf-btn-manha').onclick = () => {
      textarea.value = gerarRelatorio('manha');
      textarea.style.display = 'block';
      btnCopiar.style.display = 'block';
      btnCopiar.textContent = '📋 Copiar texto';
    };
    document.getElementById('rf-btn-tarde').onclick = () => {
      textarea.value = gerarRelatorio('tarde');
      textarea.style.display = 'block';
      btnCopiar.style.display = 'block';
      btnCopiar.textContent = '📋 Copiar texto';
    };
    btnCopiar.onclick = () => {
      navigator.clipboard.writeText(textarea.value).catch(() => {
        textarea.select(); document.execCommand('copy');
      }).finally(() => {
        btnCopiar.textContent = '✅ Copiado!';
        setTimeout(() => resetarRelatorio(), 1500);
      });
    };
  }

  salvarEstadoOriginal();
  criarIcone();

})();