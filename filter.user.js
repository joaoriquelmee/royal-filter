// ==UserScript==
// @name         Royal Filter
// @namespace    http://tampermonkey.net/
// @version      1.3
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

  function getProfessor(evento) {
    const spanManyPeople = evento.querySelector('.schedule-event-content-many-people b');
    if (spanManyPeople) return spanManyPeople.textContent.replace(/\s+/g, ' ').trim();
    const spanGenerico = evento.querySelector('.schedule-event-content span b');
    if (spanGenerico) return spanGenerico.textContent.replace(/\s+/g, ' ').trim();
    return null;
  }

  function getPrimeiroNome(nomeCompleto) {
    if (!nomeCompleto) return null;
    const primeiro = nomeCompleto.split(' ')[0];
    const apelidos = {
      'Vitorino': 'Birinha',
      'João': 'JP'
    };
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

  // ─── Badge compacto ao lado do nome do professor ────────────
  // Fica entre o <b> do professor e o contador total de alunos
  // (canto superior direito), um espaço que nunca é ocupado.
  function adicionarBadge(conteudo, vagasFixas, vagasDia) {
    const antigo = conteudo.querySelector('.badge-vagas-letz');
    if (antigo) antigo.remove();

    let txt = '';
    let cor = '';

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
    badge.style.cssText = `
      display: inline-block;
      font-size: 8px; font-weight: bold;
      color: #fff; background: ${cor};
      padding: 1px 3px; border-radius: 3px;
      line-height: 1.3; pointer-events: none;
      margin-left: 4px; vertical-align: middle;
      white-space: nowrap;
    `;
    badge.textContent = txt;

    const negrito = conteudo.querySelector('.schedule-event-content-many-people b, span > b');
    if (negrito) {
      const brInterno = negrito.querySelector('br');
      if (brInterno) {
        brInterno.insertAdjacentElement('beforebegin', badge);
      } else {
        negrito.appendChild(badge);
      }
    } else {
      // Fallback: caso não encontre o <b>, usa a posição antiga
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
    const professoresSelecionados = Array.from(
      document.querySelectorAll('.rf-chk-prof:checked')
    ).map(el => el.value);
    const filtraProfessor = professoresSelecionados.length > 0;
    const horasSelecionadas = Array.from(
      document.querySelectorAll('.rf-pill-hora.ativa')
    ).map(el => parseInt(el.dataset.hora));
    const filtraHorario = horasSelecionadas.length > 0;

    if (!mostrarComVaga && !mostrarExperimental && !mostrarLocacao && !filtraProfessor && !filtraHorario) return;

    document.querySelectorAll('.schedule-event').forEach(evento => {
      const conteudo = evento.querySelector('.schedule-event-content');
      if (!conteudo) { evento.style.display = 'none'; return; }

      const eLocacao = conteudo.classList.contains('schedule-cluborlocation');

      if (mostrarLocacao) {
        evento.style.display = eLocacao ? '' : 'none';
        return;
      }

      if (eLocacao) { evento.style.display = 'none'; return; }
      if (!ehAula(evento)) { evento.style.display = 'none'; return; }

      const cancelado =
        evento.classList.contains('schedule-canceled') ||
        conteudo.classList.contains('schedule-canceled');
      if (cancelado) { evento.style.display = 'none'; return; }

      const { vagasFixas, vagasDia, faltantes, temExperimental } = contarAlunos(conteudo);
      const professor = getProfessor(evento);

      let passaProfessor = true;
      if (filtraProfessor) {
        passaProfessor = professor !== null && professoresSelecionados.includes(professor);
      }

      if (!passaProfessor) { evento.style.display = 'none'; return; }

      let passaHorario = true;
      if (filtraHorario) {
        const horaTurma = marginTopParaHora(evento.style.marginTop);
        passaHorario = horaTurma !== null && horasSelecionadas.includes(horaTurma);
      }

      if (!passaHorario) { evento.style.display = 'none'; return; }

      let deveExibir = false;
      if (!mostrarComVaga && !mostrarExperimental) {
        deveExibir = true;
      } else {
        if (mostrarComVaga && (vagasFixas > 0 || vagasDia > 0)) deveExibir = true;
        if (mostrarExperimental && temExperimental) deveExibir = true;
      }

      if (deveExibir) {
        evento.style.display = '';
        adicionarBadge(conteudo, vagasFixas, vagasDia);
      } else {
        evento.style.display = 'none';
      }
    });
  }

  // ─── Ícone flutuante e draggável ──────────────────────────────
  function criarIcone() {
    const antigo = document.getElementById('royal-filter-icone');
    if (antigo) antigo.remove();

    const icone = document.createElement('div');
    icone.id = 'royal-filter-icone';
    icone.style.cssText = `
      position: fixed; top: 100px; right: 16px;
      width: 56px; height: 56px;
      background: #1e2d3d; border: 2px solid #3d5a73;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      z-index: 100000;
      cursor: grab; user-select: none;
    `;
    icone.textContent = '👑';
    document.body.appendChild(icone);

    let arrastando = false, moveu = false, startX, startY, startLeft, startTop;

    icone.addEventListener('mousedown', (e) => {
      arrastando = true;
      moveu = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = icone.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;
      icone.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!arrastando) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moveu = true;
      icone.style.right = 'auto';
      icone.style.left  = `${startLeft + dx}px`;
      icone.style.top   = `${startTop  + dy}px`;
    });

    document.addEventListener('mouseup', () => {
      if (arrastando && !moveu) {
        icone.style.display = 'none';
        if (!painelMontado) {
          montarPainel();
          painelMontado = true;
        } else {
          const painel = document.getElementById('royal-filter-painel');
          if (painel) painel.style.display = '';
        }
      }
      arrastando = false;
      icone.style.cursor = 'grab';
    });

    return icone;
  }

  function mostrarIcone() {
    const icone = document.getElementById('royal-filter-icone');
    if (icone) icone.style.display = 'flex';
  }

  function montarPainel() {
    const antigo = document.getElementById('royal-filter-painel');
    if (antigo) antigo.remove();

    const professores = coletarProfessores();

    const painel = document.createElement('div');
    painel.id = 'royal-filter-painel';
    painel.style.cssText = `
      position: fixed; top: 80px; right: 16px;
      z-index: 99999; width: 240px;
      background: #1e2d3d; color: #ecf0f1;
      border-radius: 14px; padding: 16px;
      font-family: 'Segoe UI', sans-serif; font-size: 13px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.5);
      max-height: 85vh; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: #3d5a73 #1e2d3d;
      cursor: default;
    `;

    // Botão de minimizar em dourado, com texto pequeno, para destacar bem
    // contra o fundo escuro do painel (#1e2d3d).
    const header = `
      <div id="rf-header" style="position:relative;display:flex;align-items:center;justify-content:center;cursor:grab;user-select:none;padding-bottom:8px">
        <span style="font-size:15px;font-weight:700;letter-spacing:1px">👑 Royal Filter</span>
        <button id="rf-btn-minimizar" style="
          position:absolute;right:0;top:50%;transform:translateY(-50%);
          background:none;border:1px solid #3d5a73;color:#95a5a6;
          border-radius:5px;padding:1px 7px;cursor:pointer;font-size:11px;
          line-height:1.4;flex-shrink:0;
        ">▼</button>
      </div>
      <div id="rf-subtitulo" style="text-align:center;font-size:10px;color:#f39c12;margin-bottom:12px">⚠️ Em desenvolvimento</div>
      <hr id="rf-hr-header" style="border-color:rgba(255,255,255,0.1);margin-bottom:12px">
    `;

    const secaoFiltros = `
      <div id="rf-corpo">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;
                    color:#95a5a6;margin-bottom:8px;letter-spacing:.5px">Visualização</div>

        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="rf-chk-vaga" style="accent-color:#27ae60;width:14px;height:14px;flex-shrink:0">
          <span style="white-space:nowrap;font-size:12px">Turmas com vagas ✅</span>
        </label>

        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="rf-chk-exp" style="accent-color:#8e44ad;width:14px;height:14px;flex-shrink:0">
          <span style="white-space:nowrap;font-size:12px">Aulas com Experimentais 🧪</span>
        </label>

        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="rf-chk-locacao" style="accent-color:#e67e22;width:14px;height:14px;flex-shrink:0">
          <span style="white-space:nowrap;font-size:12px">Horários para Locação 🤑</span>
        </label>

        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;
                      color:#95a5a6;letter-spacing:.5px">Por Professor</div>
          <button id="rf-btn-toggle-profs" style="
            background:none;border:1px solid #3d5a73;color:#95a5a6;
            border-radius:5px;padding:2px 7px;cursor:pointer;font-size:11px;
          ">▼ Mostrar</button>
        </div>
        <div id="rf-lista-profs" style="display:none">${professores.map(prof => `
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer">
            <input type="checkbox" class="rf-chk-prof" value="${prof}"
                   style="accent-color:#2980b9;width:14px;height:14px">
            <span style="font-size:12px">${prof}</span>
          </label>
        `).join('') || '<span style="color:#7f8c8d;font-size:11px">Nenhum professor encontrado</span>'}</div>

        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;
                      color:#95a5a6;letter-spacing:.5px">Por Horário</div>
          <button id="rf-btn-toggle-horas" style="
            background:none;border:1px solid #3d5a73;color:#95a5a6;
            border-radius:5px;padding:2px 7px;cursor:pointer;font-size:11px;
          ">▼ Mostrar</button>
        </div>
        <div id="rf-lista-horas" style="display:none;grid-template-columns:repeat(5, 1fr);gap:5px;">
          ${Array.from({length: 17}, (_, i) => i + 6).map(h => `
            <button type="button" class="rf-pill-hora" data-hora="${h}" style="
              background:#2c3e50;border:1px solid #3d5a73;color:#ecf0f1;
              border-radius:14px;padding:5px 0;cursor:pointer;font-size:11px;font-weight:bold;
              text-align:center;
            ">${h}h</button>
          `).join('')}
        </div>

        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">

        <div style="font-size:11px;font-weight:600;text-transform:uppercase;
                    color:#95a5a6;margin-bottom:8px;letter-spacing:.5px">Relatório de Presença</div>

        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button id="rf-btn-manha" style="
            flex:1;padding:7px 4px;
            background:#2980b9;border:none;color:white;
            border-radius:7px;cursor:pointer;font-size:11px;font-weight:bold">
            🌅 Manhã
          </button>
          <button id="rf-btn-tarde" style="
            flex:1;padding:7px 4px;
            background:#e67e22;border:none;color:white;
            border-radius:7px;cursor:pointer;font-size:11px;font-weight:bold">
            🌆 Tarde
          </button>
        </div>

        <textarea id="rf-relatorio-texto" style="
          width:100%;height:120px;
          background:#0f1c29;color:#ecf0f1;
          border:1px solid #3d5a73;border-radius:7px;
          padding:8px;font-size:10px;font-family:monospace;
          resize:none;box-sizing:border-box;
          display:none;
        " readonly></textarea>

        <button id="rf-btn-copiar" style="
          width:100%;padding:6px;margin-top:6px;
          background:#16a085;border:none;color:white;
          border-radius:7px;cursor:pointer;font-size:11px;font-weight:bold;
          display:none;
        ">📋 Copiar texto</button>

        <hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">

        <button id="rf-btn-aplicar" style="
          width:100%;padding:8px;margin-bottom:6px;
          background:#27ae60;border:none;color:white;
          border-radius:7px;cursor:pointer;font-size:12px;font-weight:bold">
          ▶ Aplicar filtros
        </button>
        <button id="rf-btn-restaurar" style="
          width:100%;padding:8px;
          background:#c0392b;border:none;color:white;
          border-radius:7px;cursor:pointer;font-size:12px;font-weight:bold">
          ↩ Restaurar tudo
        </button>

        <div style="text-align:center;margin-top:14px;font-size:10px;color:#5d7a8a">
          Desenvolvido por
          <span id="rf-dev-nome" style="font-weight:700;font-size:11px;letter-spacing:1px;">Riquelme</span>
        </div>
      </div>
    `;

    painel.innerHTML = header + secaoFiltros;
    document.body.appendChild(painel);

    // ─── Neon ciano fixo ──────────────────────────────────────
    const nomeEl = document.getElementById('rf-dev-nome');
    nomeEl.style.color = '#00f5ff';
    nomeEl.style.textShadow = '0 0 6px #00f5ff, 0 0 12px #00f5ff, 0 0 20px #00c8d4';

    // ─── Minimizar painel inteiro / volta para ícone ──────────
    const btnMinimizar = document.getElementById('rf-btn-minimizar');
    btnMinimizar.onclick = (e) => {
      e.stopPropagation();
      painel.style.display = 'none';
      mostrarIcone();
    };

    // ─── Arrastar painel ──────────────────────────────────────
    const rfHeader = document.getElementById('rf-header');
    let arrastando = false, startX, startY, startLeft, startTop;

    rfHeader.addEventListener('mousedown', (e) => {
      if (e.target === btnMinimizar) return;
      arrastando = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = painel.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;
      rfHeader.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!arrastando) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      painel.style.right = 'auto';
      painel.style.left  = `${startLeft + dx}px`;
      painel.style.top   = `${startTop  + dy}px`;
    });

    document.addEventListener('mouseup', () => {
      arrastando = false;
      rfHeader.style.cursor = 'grab';
    });

    // ─── Toggle lista de professores (minimizada por padrão) ──
    const listaProfs = document.getElementById('rf-lista-profs');
    const btnToggle  = document.getElementById('rf-btn-toggle-profs');
    let profsVisiveis = false;
    btnToggle.onclick = () => {
      profsVisiveis = !profsVisiveis;
      listaProfs.style.display = profsVisiveis ? '' : 'none';
      btnToggle.textContent = profsVisiveis ? '▲ Ocultar' : '▼ Mostrar';
    };

    // ─── Toggle lista de horários (minimizada por padrão) ─────
    const listaHoras = document.getElementById('rf-lista-horas');
    const btnToggleHoras = document.getElementById('rf-btn-toggle-horas');
    let horasVisiveis = false;
    btnToggleHoras.onclick = () => {
      horasVisiveis = !horasVisiveis;
      listaHoras.style.display = horasVisiveis ? 'grid' : 'none';
      btnToggleHoras.textContent = horasVisiveis ? '▲ Ocultar' : '▼ Mostrar';
    };

    // ─── Seleção múltipla de pílulas de horário ────────────────
    painel.querySelectorAll('.rf-pill-hora').forEach(pill => {
      pill.onclick = () => {
        const ativa = pill.classList.toggle('ativa');
        pill.style.background = ativa ? '#2980b9' : '#2c3e50';
        pill.style.borderColor = ativa ? '#2980b9' : '#3d5a73';
      };
    });

    document.getElementById('rf-btn-aplicar').onclick = aplicarFiltros;
    document.getElementById('rf-btn-restaurar').onclick = () => {
      restaurarTudo();
      painel.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
      painel.querySelectorAll('.rf-pill-hora.ativa').forEach(pill => {
        pill.classList.remove('ativa');
        pill.style.background = '#2c3e50';
        pill.style.borderColor = '#3d5a73';
      });
    };

    // ─── Relatório ────────────────────────────────────────────
    const textarea  = document.getElementById('rf-relatorio-texto');
    const btnCopiar = document.getElementById('rf-btn-copiar');

    function mostrarRelatorio(turno) {
      textarea.value = gerarRelatorio(turno);
      textarea.style.display = 'block';
      btnCopiar.style.display = 'block';
      btnCopiar.textContent = '📋 Copiar texto';
    }

    document.getElementById('rf-btn-manha').onclick = () => mostrarRelatorio('manha');
    document.getElementById('rf-btn-tarde').onclick = () => mostrarRelatorio('tarde');

    document.getElementById('rf-btn-copiar').onclick = () => {
      navigator.clipboard.writeText(textarea.value).catch(() => {
        textarea.select();
        document.execCommand('copy');
      }).finally(() => {
        btnCopiar.textContent = '✅ Copiado!';
        setTimeout(() => resetarRelatorio(), 1500);
      });
    };
  }

  salvarEstadoOriginal();
  criarIcone();

})();