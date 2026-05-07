document.addEventListener("DOMContentLoaded", () => {

  // ================= CONFIGURAÇÃO =================
  const INTERVALO = 300; // segundos
  const EXIBIR_PAINEL_INFO = false; // false = oculta status do tempo e alertas sem remover o código
  let LAT = -20.8113;
  let LON = -49.3758;
  let nomeCidadeAtual = "São José do Rio Preto-SP";
  let restante = INTERVALO;
  let alertaDisparado = false;

  // ================= ELEMENTOS =================
  const cidadeAtualEl = document.getElementById("cidadeAtual");
  const painelInfoEl = document.querySelector(".box");
  const statusEl = document.getElementById("status");
  const detalheEl = document.getElementById("detalhe");
  const alertaEl = document.getElementById("alerta");
  const contadorEl = document.getElementById("contador");
  const ultimaAtualizacaoEl = document.getElementById("ultimaAtualizacao");
  const mapaRadarEl = document.getElementById("mapaRadar");
  const mapaLegendaEl = document.getElementById("mapaLegenda");

  const cidadeInput = document.getElementById("cidade");
  const btnBuscar = document.getElementById("btnBuscar");
  const btnGPS = document.getElementById("btnGPS");
  const btnRefresh = document.getElementById("btnRefresh");
  const audio = document.getElementById("alertSound");
  const previsao12hEl = document.getElementById("previsao12h");

  function aplicarVisibilidadePainelInfo() {
    if (!painelInfoEl) return;
    painelInfoEl.style.display = EXIBIR_PAINEL_INFO ? "" : "none";
  }

  // ================= EVENTOS =================
  btnBuscar.addEventListener("click", buscarCidade);
  btnGPS.addEventListener("click", usarGPS);
  btnRefresh.addEventListener("click", () => window.location.reload());

  // ================= AUDIO =================
  // Função de alerta sonoro desativada temporariamente, sem remover o código.
  // let audioLiberado = false;

  // document.addEventListener("click", () => {
  //   if (!audioLiberado && audio) {
  //     audio.play().then(() => {
  //       audio.pause();
  //       audio.currentTime = 0;
  //       audioLiberado = true;
  //       console.log("🔓 Som liberado");
  //     }).catch(() => {});
  //   }
  // }, { once: true });

  // ================= FUNÇÕES =================
  const UF_POR_ESTADO = {
    Acre: "AC",
    Alagoas: "AL",
    Amapá: "AP",
    Amazonas: "AM",
    Bahia: "BA",
    Ceará: "CE",
    "Distrito Federal": "DF",
    "Espírito Santo": "ES",
    Goiás: "GO",
    Maranhão: "MA",
    "Mato Grosso": "MT",
    "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG",
    Pará: "PA",
    Paraíba: "PB",
    Paraná: "PR",
    Pernambuco: "PE",
    Piauí: "PI",
    "Rio de Janeiro": "RJ",
    "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS",
    Rondônia: "RO",
    Roraima: "RR",
    "Santa Catarina": "SC",
    "São Paulo": "SP",
    Sergipe: "SE",
    Tocantins: "TO"
  };

  function formatarNomeCidade({ name, admin1, country_code }) {
    if (!name) return "Local atual";

    if (country_code === "BR" && admin1) {
      const uf = UF_POR_ESTADO[admin1] || admin1;
      return `${name}-${uf}`;
    }

    if (admin1) return `${name}-${admin1}`;
    return name;
  }

  function mostrarCidade(nome) {
    nomeCidadeAtual = nome;
    cidadeAtualEl.innerHTML = `📍 Cidade: <b>${nome}</b>`;
  }

  function atualizarMapa(nomeCidade = "Local atual") {
    if (!mapaRadarEl) return;

    mapaRadarEl.src = `https://www.rainviewer.com/map.html?loc=${LAT},${LON},10&oCS=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`;
    mapaRadarEl.title = `Mapa radar de ${nomeCidade}`;

    if (mapaLegendaEl) {
      mapaLegendaEl.innerText = `Mapa de ${nomeCidade}`;
    }
  }

  async function obterNomeCidadePorCoordenadas(latitude, longitude) {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=pt`
    );

    if (!r.ok) {
      throw new Error("Falha ao obter cidade");
    }

    const data = await r.json();
    const resultado = data.results?.[0];

    if (!resultado?.name) {
      throw new Error("Cidade não encontrada para as coordenadas");
    }

    return formatarNomeCidade(resultado);
  }

  function definirStatus(prob, chuva) {
    if (chuva > 0.5) return "🔴 Chuva forte ⛈️";
    if (prob >= 40) return "🟠 Chuva se aproximando";
    if (prob >= 20) return "🟡 Chuva possível";
    return "🟢 Sem chuva";
  }

  function iconePorProbabilidade(prob) {
    if (prob >= 70) return "⛈️";
    if (prob >= 40) return "🌧️";
    if (prob >= 20) return "🌦️";
    return "☁️";
  }

  function formatarVelocidadeVento(velocidade) {
    if (!Number.isFinite(velocidade)) return "-- km/h";
    return `${velocidade.toFixed(0)} km/h`;
  }

  function formatarDirecaoVento(direcao) {
    if (!Number.isFinite(direcao)) return "direção indisponível";
    return `${Math.round(direcao)}°`;
  }

  function obterChaveHoraAtualSaoPaulo() {
    const agora = new Date();
    const partes = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false
    }).formatToParts(agora);

    const mapa = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:00`;
  }

  function renderizarPrevisao12h(hourly) {
    if (!previsao12hEl || !hourly?.time) return;

    const chaveHoraAtual = obterChaveHoraAtualSaoPaulo();
    const indiceInicial = Math.max(hourly.time.findIndex(time => time >= chaveHoraAtual), 0);

    const proximas12 = hourly.time.slice(indiceInicial, indiceInicial + 12).map((time, i) => ({
      time,
      temp: hourly.temperature_2m[indiceInicial + i],
      precip: hourly.precipitation[indiceInicial + i],
      prob: hourly.precipitation_probability[indiceInicial + i],
      windSpeed: hourly.wind_speed_10m[indiceInicial + i],
      windDirection: hourly.wind_direction_10m[indiceInicial + i]
    }));

    previsao12hEl.innerHTML = proximas12.map(item => {
      const horario = item.time.slice(11, 16);

      return `
        <article class="previsao-card" role="listitem" aria-label="Previsão para ${horario}, vento ${formatarVelocidadeVento(item.windSpeed)} na direção ${formatarDirecaoVento(item.windDirection)}">
          <div class="hora">${horario}</div>
          <div class="icone-clima">${iconePorProbabilidade(item.prob)}</div>
          <div class="temperatura">${item.temp.toFixed(0)}°C</div>
          <div class="chuva">${item.prob}% · ${item.precip.toFixed(1)} mm</div>
          <div class="vento-card" aria-label="Vento ${formatarVelocidadeVento(item.windSpeed)} na direção ${formatarDirecaoVento(item.windDirection)}">
            <span class="seta-vento" style="--direcao-vento: ${Number.isFinite(item.windDirection) ? item.windDirection : 0}deg" aria-hidden="true">↑</span>
            <span class="velocidade-vento">${formatarVelocidadeVento(item.windSpeed)}</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderizarAlerta(prob, chuva, temperatura, vento) {
    const alertaAtivo = prob >= 40 || chuva > 0.5;

    const blocoAlerta = alertaAtivo
      ? `
        <div class="alerta">
          ⛈️ ALERTA DE CHUVA!<br>
          Prob.: ${prob}% | Precip.: ${chuva.toFixed(2)} mm
        </div>
      `
      : '<div class="sem-alerta">✅ Sem alerta de chuva no momento.</div>';

    alertaEl.innerHTML = `
      ${blocoAlerta}
      <div class="info-clima">🌡️ Temperatura: <b>${temperatura.toFixed(1)}°C</b></div>
      <div class="info-clima">💨 Vento: <b>${vento.toFixed(1)} km/h</b></div>
    `;
  }

  async function buscarCidade() {
    try {
      const nome = cidadeInput.value.trim();
      if (!nome) throw "Digite a cidade";

      statusEl.innerText = "⏳ Buscando cidade...";
      alertaEl.innerHTML = "";

      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt`
      );

      if (!r.ok) throw "Erro ao buscar cidade";

      const data = await r.json();
      if (!data.results) throw "Cidade não encontrada";

      LAT = data.results[0].latitude;
      LON = data.results[0].longitude;

      const nomeCidade = formatarNomeCidade(data.results[0]);
      mostrarCidade(nomeCidade);
      atualizarMapa(nomeCidade);
      atualizarTudo();
    } catch (e) {
      statusEl.innerText = "❌ " + e;
      alertaEl.innerHTML = "";
    }
  }

  function usarGPS() {
    if (!navigator.geolocation) {
      statusEl.innerText = "❌ Geolocalização não suportada";
      return;
    }

    statusEl.innerText = "📍 Obtendo localização...";
    alertaEl.innerHTML = "";

    navigator.geolocation.getCurrentPosition(async pos => {
      LAT = pos.coords.latitude;
      LON = pos.coords.longitude;

      let nomeCidade = nomeCidadeAtual;

      try {
        nomeCidade = await obterNomeCidadePorCoordenadas(LAT, LON);
      } catch (erro) {
        console.error("Erro ao resolver cidade da localização:", erro);
      }

      mostrarCidade(nomeCidade);
      atualizarMapa(nomeCidade);
      atualizarTudo();
    }, () => {
      statusEl.innerText = "❌ Permissão de localização negada";
    });
  }

  async function atualizarPrevisao() {
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=precipitation_probability,precipitation,temperature_2m,wind_speed_10m,wind_direction_10m&timezone=America/Sao_Paulo`
      );

      if (!r.ok) throw "Erro na previsão";

      const data = await r.json();
      renderizarPrevisao12h(data.hourly);

      if (!EXIBIR_PAINEL_INFO) return;

      const prob = Math.max(...data.hourly.precipitation_probability.slice(0, 4));
      const chuva = Math.max(...data.hourly.precipitation.slice(0, 4));
      const temperatura = data.hourly.temperature_2m[0];
      const vento = data.hourly.wind_speed_10m[0];

      statusEl.innerText = definirStatus(prob, chuva);
      detalheEl.innerHTML = `
        Probabilidade máx.: <b>${prob}%</b><br>
        Precipitação: <b>${chuva.toFixed(2)} mm</b>
      `;

      dispararAlerta(prob, chuva);
      renderizarAlerta(prob, chuva, temperatura, vento);

      if (prob < 20 && chuva === 0) {
        alertaDisparado = false;
      }

      const agora = new Date();
      const horaFormatada = agora.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      });

      ultimaAtualizacaoEl.innerText = `🕒 Última atualização: ${horaFormatada}`;
      restante = INTERVALO;

    } catch (e) {
      statusEl.innerText = "❌ Erro ao atualizar previsão";
      alertaEl.innerHTML = "";
      console.error("Erro atualizarPrevisao:", e);
    }
  }

  function dispararAlerta(prob, chuva) {
    if (alertaDisparado) return;

    if (prob >= 40 || chuva > 0.5) {
      alertaDisparado = true;

      // if (audioLiberado && audio) {
      //   audio.currentTime = 0;
      //   audio.play().catch(() => {});
      // }
    }
  }

  function atualizarContador() {
    const m = Math.floor(restante / 60);
    const s = restante % 60;
    contadorEl.innerText =
      `🔄 Próxima atualização em ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    if (restante > 0) restante--;
  }

  function atualizarTudo() {
    atualizarPrevisao();
  }

  // ================= INICIALIZAÇÃO =================
  mostrarCidade("São José do Rio Preto-SP");
  aplicarVisibilidadePainelInfo();
  atualizarMapa("São José do Rio Preto-SP");
  atualizarTudo();
  if (EXIBIR_PAINEL_INFO) {
    atualizarContador();
  }

  if (EXIBIR_PAINEL_INFO) {
    setInterval(atualizarPrevisao, INTERVALO * 1000);
    setInterval(atualizarContador, 1000);
  }

});
