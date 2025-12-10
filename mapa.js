// =================================================================
// 1. VARIÁVEIS DE CONFIGURAÇÃO E DADOS
// =================================================================

// FOCA NO CENTRO DO RIO GRANDE DO SUL
const CENTRO_MAPA = [-30.0328, -51.2304];
const ZOOM_INICIAL = 7;

// LINK DE PUBLICAÇÃO ATUALIZADO (Web/Google Sheets)
const URL_DADOS_MESTRA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTCaSRtV1pgSer6EXDV1NfUW4NEl3mcY6d-fjiIld4jqz4X9HZAzLarap4BStAZTpALIUnzNZ9Z0Eoz/pub?gid=1293029009&single=true&output=csv';

// Serviço de roteamento Open Source (para rotas e linhas de trecho)
const URL_OSRM = 'https://router.project-osrm.org/route/v1/driving/';

let dadosPedagios = [];
let dadosObras = [];
let dadosViasDuplas = [];
let rotaAtualLayer;
const coordenadasPlotadas = []; // Mantido para referência, mas não usado para zoom


// =================================================================
// 2. INICIALIZAÇÃO DO MAPA (LEAFLET/OSM)
// =================================================================

const map = L.map('mapa-customizado').setView(CENTRO_MAPA, ZOOM_INICIAL);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
}).addTo(map);


// =================================================================
// 3. DEFINIÇÃO DOS ÍCONES CUSTOMIZADOS
// =================================================================
// Certifique-se de que os ícones estão em: assets/icons/
const IconePedagio = L.icon({ iconUrl: './assets/icons/icon-pedagio.png', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30] });
const IconeObra = L.icon({ iconUrl: './assets/icons/icon-obra.png', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30] });
const IconeViaDupla = L.icon({ iconUrl: './assets/icons/icon-caminhao.png', iconSize: [20, 20], iconAnchor: [10, 20], popupAnchor: [0, -20] });


// =================================================================
// 4. FUNÇÕES DE VISUALIZAÇÃO E DADOS (Popup e Plotagem)
// =================================================================

function construirPopup(data) {
    const tipo = (data.TIPO || 'desconhecido').toLowerCase();
    let html = `<h4>${data.NOME || 'Ponto no Mapa'}</h4>`;

    // As colunas de tarifa são lidas em EIXO_1_2 e EIXO_ADICIONAL
    const eixo12 = parseFloat(data.EIXO_1_2 || 0);
    const eixoAdicional = parseFloat(data.EIXO_ADICIONAL || 0);
    const impacto = data.IMPACTO;

    html += `<p>Rodovia: <b>${data.RODOVIA || 'N/A'}</b></p>`;
    html += `<p>Descrição: ${data.DESCRICAO || 'Não especificada'}</p>`;

    if (tipo === 'pedagio') {
        if (!isNaN(eixo12) && eixo12 > 0) html += `<p>Tarifa Base (2 Eixos): <b style="color: blue;">R$ ${eixo12.toFixed(2).replace('.', ',')}</b></p>`;
        if (!isNaN(eixoAdicional) && eixoAdicional > 0) html += `<p>Eixo Adicional: R$ ${eixoAdicional.toFixed(2).replace('.', ',')}</p>`;
    } else if (tipo === 'obra') {
        html += `<p style="color: ${impacto && impacto.includes('Total') ? 'red' : 'orange'};">Impacto: <b>${impacto || 'N/A'}</b></p>`;
        if (data.DATA_FIM) html += `<p>Previsão de Fim: ${data.DATA_FIM}</p>`;
    } else if (tipo === 'via_dupla') {
        html += `<p style="color: green;">Status: **Trecho Duplicado**</p>`;
    }

    return html;
}

function plotarPOI(data) {
    const tipo = (data.TIPO || 'DESCONHECIDO').toLowerCase();

    // Coordenadas para pontos (Lat/Lon nativas)
    const lat = parseFloat(data.LAT);
    const lon = parseFloat(data.LON);

    // Coordenadas para trechos (Lat/Lon nativas)
    const startLat = parseFloat(data.START_LAT);
    const startLon = parseFloat(data.START_LON);
    const endLat = parseFloat(data.END_LAT);
    const endLon = parseFloat(data.END_LON);

    // Coleta coordenadas válidas para o ajuste de zoom (mantido para debugging)
    if (!isNaN(lat) && !isNaN(lon)) coordenadasPlotadas.push(L.latLng(lat, lon));
    if (!isNaN(startLat) && !isNaN(startLon)) coordenadasPlotadas.push(L.latLng(startLat, startLon));
    if (!isNaN(endLat) && !isNaN(endLon)) coordenadasPlotadas.push(L.latLng(endLat, endLon));


    let icon;
    let estilo;

    if (tipo === 'pedagio') {
        icon = IconePedagio;
    } else if (tipo === 'obra') {
        icon = IconeObra;
        // Cor vermelha, linha tracejada para obras
        estilo = { color: '#FF0000', weight: 5, opacity: 0.8, dashArray: '10, 5' };
    } else if (tipo === 'via_dupla') {
        icon = IconeViaDupla;
        // Cor verde para vias duplas
        estilo = { color: '#00AA00', weight: 4, opacity: 0.9 };
    }

    // --- LÓGICA PARA TRAÇAR UM TRECHO DE LINHA (OBRA/VIA_DUPLA) USANDO OSRM ---
    // Verifica se temos coordenadas de início E fim válidas para um trecho
    if (!isNaN(startLat) && !isNaN(endLat) && (Math.abs(startLat - endLat) > 0.0001 || Math.abs(startLon - endLon) > 0.0001) && estilo && (tipo === 'obra' || tipo === 'via_dupla')) {

        // Renderiza a linha de estrada entre os dois pontos
        calcularERenderizarTrecho(
            { lat: startLat, lon: startLon },
            { lat: endLat, lon: endLon },
            estilo,
            data
        );

        // Opcional: Adiciona um marcador de ponto no início do trecho
        L.marker([startLat, startLon], { icon: icon, opacity: 0.7 })
            .addTo(map)
            .bindPopup(construirPopup(data));
    }
    // --- LÓGICA PARA PLOTAR UM PONTO (PEDAGIO, Obra Pontual, ou Via Dupla sem trecho) ---
    else if (!isNaN(lat) && !isNaN(lon) && (tipo === 'pedagio' || tipo === 'obra' || tipo === 'via_dupla')) {
        L.marker([lat, lon], { icon: icon })
            .addTo(map)
            .bindPopup(construirPopup(data));
    }
}


// --- Funções de Limpeza de Dados e CSV Parser ---

const cleanNumber = (val) => {
    // Trata formatação de números (vírgula/ponto)
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') {
        let cleanVal = val.trim();

        // Remove pontos de milhar, substitui vírgula por ponto decimal
        if (cleanVal.includes(',') && cleanVal.includes('.')) {
            cleanVal = cleanVal.replace(/\./g, '');
            cleanVal = cleanVal.replace(',', '.');
        } else if (cleanVal.includes(',')) {
            cleanVal = cleanVal.replace(',', '.');
        }

        const num = parseFloat(cleanVal);
        return isNaN(num) ? NaN : num;
    }
    return NaN;
};

// Funcao csvToJson (robustez para ; ou , como delimitadores)
function csvToJson(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 1) return [];

    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = (semicolonCount > commaCount && semicolonCount > 0) ? ';' : ',';

    const linesSeparated = lines.map(line => {
        // Lógica simples de split (não ideal para campos com delimitador interno)
        if (delimiter === ',') {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') { inQuotes = !inQuotes; }
                else if (char === delimiter && !inQuotes) {
                    result.push(current.trim().replace(/"/g, ''));
                    current = '';
                } else { current += char; }
            }
            result.push(current.trim().replace(/"/g, ''));
            return result;
        } else {
            return line.split(delimiter);
        }
    }).filter(arr => arr.length > 0);

    if (linesSeparated.length === 0 || linesSeparated[0].length === 0) return [];

    const headers = linesSeparated[0].map(h => h.trim().replace(/"/g, '').toUpperCase());
    const result = [];

    for (let i = 1; i < linesSeparated.length; i++) {
        const values = linesSeparated[i];
        if (values.length === 0) continue;

        const obj = {};
        for (let j = 0; j < headers.length && j < values.length; j++) {
            let value = values[j] ? values[j].trim().replace(/"/g, '') : '';
            obj[headers[j]] = value;
        }
        if (Object.keys(obj).length > 0) {
            result.push(obj);
        }
    }
    return result;
}


async function carregarDadosMestres() {

    try {
        // Limpeza de camadas existentes
        map.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                if (layer.options.icon === IconeObra || layer.options.icon === IconePedagio || layer.options.icon === IconeViaDupla || layer.options.color === '#FF0000' || layer.options.color === '#00AA00') {
                    map.removeLayer(layer);
                }
            }
        });
        coordenadasPlotadas.length = 0;


        // Adiciona um timestamp para evitar cache
        const fetchUrl = `${URL_DADOS_MESTRA}&_t=${new Date().getTime()}`;
        const resposta = await fetch(fetchUrl);

        if (!resposta.ok) throw new Error(`Status HTTP ${resposta.status}. Se for 0, é bloqueio CORS ou link incorreto.`);

        const csvText = await resposta.text();

        // Detecta HTML de erro/login (Bloqueio de CORS)
        if (csvText.trim().startsWith('<!DOCTYPE html>')) {
            console.error("ERRO CRÍTICO: O Google Sheets está enviando HTML (Bloqueio de CORS).");
            return;
        }

        const listaPOIs = csvToJson(csvText);

        console.log("Dados lidos do CSV (Lista de POIs):", listaPOIs);

        dadosPedagios = [];
        dadosObras = [];
        dadosViasDuplas = [];

        console.log(`Iniciando o processamento de ${listaPOIs.length} linhas de dados...`);

        listaPOIs.forEach(poi => {

            const tipoMaster = (poi.TIPO || '').toUpperCase();

            if (tipoMaster !== 'PEDAGIO' && tipoMaster !== 'OBRA' && tipoMaster !== 'VIA_DUPLA') {
                return; // Ignora tipos não definidos
            }

            // 1. Limpeza de Coordenadas (Usando Lat/Lon Nativo)
            const lat = cleanNumber(poi.LAT);
            const lon = cleanNumber(poi.LON);
            const startLat = cleanNumber(poi.START_LAT);
            const startLon = cleanNumber(poi.START_LON);
            const endLat = cleanNumber(poi.END_LAT);
            const endLon = cleanNumber(poi.END_LON);

            // 2. Criação do Objeto de Plotagem 
            const POI_COMPATIVEL = {
                TIPO: tipoMaster,
                NOME: poi.NOME || 'Localização',
                RODOVIA: poi.RODOVIA || 'N/A',
                DESCRICAO: poi.DESCRICAO || 'N/A',
                IMPACTO: poi.IMPACTO || 'N/A',
                DATA_FIM: poi.DATA_FIM || '',

                // Coordenadas diretamente da planilha (Lat/Lon)
                LAT: lat,
                LON: lon,
                START_LAT: startLat,
                START_LON: startLon,
                END_LAT: endLat,
                END_LON: endLon,

                // Dados de tarifa
                EIXO_1_2: cleanNumber(poi.EIXO_1_2),
                EIXO_ADICIONAL: cleanNumber(poi.EIXO_ADICIONAL),
                ID: poi.ID || 'N/A'
            };


            // 3. Armazenamento e Plotagem
            // Garante que o ponto tem pelo menos uma coordenada válida
            if (!isNaN(POI_COMPATIVEL.LAT) && !isNaN(POI_COMPATIVEL.LON) ||
                !isNaN(POI_COMPATIVEL.START_LAT) && !isNaN(POI_COMPATIVEL.START_LON)) {

                if (tipoMaster === 'PEDAGIO') {
                    dadosPedagios.push(POI_COMPATIVEL);
                } else if (tipoMaster === 'OBRA') {
                    dadosObras.push(POI_COMPATIVEL);
                } else if (tipoMaster === 'VIA_DUPLA') {
                    dadosViasDuplas.push(POI_COMPATIVEL);
                }
                plotarPOI(POI_COMPATIVEL);
            }
        });

        // ***** AJUSTE DO ZOOM IMPLEMENTADO AQUI *****
        // REMOÇÃO DA LÓGICA DE 'map.fitBounds' para fixar no zoom 7.
        // O mapa mantém o zoom e centro definidos em CENTRO_MAPA e ZOOM_INICIAL.

        console.log(`Dados carregados: ${dadosPedagios.length} pedágios, ${dadosObras.length} obras, ${dadosViasDuplas.length} vias duplas.`);

    } catch (error) {
        console.error(`Erro ao carregar dados da planilha mestra:`, error);
        document.getElementById('mapa-customizado').innerHTML = '<div style="padding: 20px; text-align: center; color: red;">FALHA CRÍTICA: Não foi possível carregar os dados. Verifique o link de publicação.</div>';
    }
}


// =================================================================
// 5. FUNÇÕES DE ROTEAMENTO, CÁLCULO DE CUSTOS E UI
// (Implementação completa das funcionalidades de rota e custos)
// =================================================================

async function geocoding(endereco) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1`;
    try {
        const resposta = await fetch(url, { headers: { 'User-Agent': 'CalculadoraRotasCustomizada/1.0' } });
        const dados = await resposta.json();
        if (dados && dados.length > 0) {
            return { lat: parseFloat(dados[0].lat), lon: parseFloat(dados[0].lon) };
        }
        return null;
    } catch (error) {
        console.error("Erro no Geocoding:", error);
        return null;
    }
}

async function calcularERenderizarTrecho(coordsOrigem, coordsDestino, estilo, data) {
    const coordString = `${coordsOrigem.lon},${coordsOrigem.lat};${coordsDestino.lon},${coordsDestino.lat}`;
    const url = `${URL_OSRM}${coordString}?geometries=geojson&overview=full`;

    try {
        const resposta = await fetch(url);

        if (!resposta.ok) throw new Error(`OSRM Status: ${resposta.status}`);

        const dados = await resposta.json();

        if (dados.code !== 'Ok' || !dados.routes || dados.routes.length === 0) {
            // FALLBACK: Traça linha reta se OSRM falhar
            const pontosTrecho = [[coordsOrigem.lat, coordsOrigem.lon], [coordsDestino.lat, coordsDestino.lon]];
            L.polyline(pontosTrecho, estilo)
                .addTo(map)
                .bindPopup(construirPopup(data));
            return;
        }

        const geojson = dados.routes[0].geometry;
        const coordsInvertidas = geojson.coordinates.map(coord => [coord[1], coord[0]]);

        // Plota a Polyline usando a geometria do OSRM (curvas da estrada)
        L.polyline(coordsInvertidas, estilo)
            .addTo(map)
            .bindPopup(construirPopup(data));

    } catch (error) {
        // Em caso de erro, usamos a linha reta como fallback
        const pontosTrecho = [[coordsOrigem.lat, coordsOrigem.lon], [coordsDestino.lat, coordsDestino.lon]];
        L.polyline(pontosTrecho, estilo)
            .addTo(map)
            .bindPopup(construirPopup(data));
    }
}


async function calcularERenderizarRota(coordsOrigem, coordsDestino, eixos) {
    const coordString = `${coordsOrigem.lon},${coordsOrigem.lat};${coordsDestino.lon},${coordsDestino.lat}`;
    const url = `${URL_OSRM}${coordString}?steps=true&geometries=geojson&overview=full`;

    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`OSRM Status: ${resposta.status}`);

        const dados = await resposta.json();

        if (dados.code !== 'Ok' || !dados.routes || dados.routes.length === 0) {
            alert("Não foi possível encontrar uma rota válida entre os pontos.");
            return;
        }

        const rota = dados.routes[0];
        const distanciaKM = (rota.distance / 1000).toFixed(2);
        const duracaoMin = (rota.duration / 60).toFixed(0);

        if (rotaAtualLayer) {
            map.removeLayer(rotaAtualLayer);
        }

        const geojson = rota.geometry;
        const coordsInvertidas = geojson.coordinates.map(coord => [coord[1], coord[0]]);

        rotaAtualLayer = L.polyline(coordsInvertidas, {
            color: '#007bff', weight: 6, opacity: 0.7
        }).addTo(map);

        map.fitBounds(rotaAtualLayer.getBounds()); // A rota deve ter o zoom ajustado

        calcularCustoCustomizado(geojson.coordinates, distanciaKM, duracaoMin, eixos);

    } catch (error) {
        console.error("Erro no Roteamento OSRM:", error);
        alert("Ocorreu um erro ao calcular a rota. Tente novamente.");
    }
}

function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calcularPedagios(geometriaRota, eixos) {
    if (document.getElementById('evitar-pedagios') && document.getElementById('evitar-pedagios').checked) {
        return { total: 0, porEixo: 0 };
    }

    const RAIO_DETECCAO_KM = 0.5;
    let pedagioTotal = 0;
    const pedagiosEncontrados = new Set();

    for (const pedagio of dadosPedagios) {

        const pedagioLat = parseFloat(pedagio.LAT);
        const pedagioLon = parseFloat(pedagio.LON);
        const eixo12 = cleanNumber(pedagio.EIXO_1_2);
        const eixoAdicional = cleanNumber(pedagio.EIXO_ADICIONAL);

        if (isNaN(pedagioLat) || isNaN(pedagioLon) || isNaN(eixo12) || isNaN(eixoAdicional)) continue;

        // OSRM retorna coordenadas [Lon, Lat]
        for (const [lonRota, latRota] of geometriaRota) {

            const distancia = calcularDistanciaHaversine(
                latRota, lonRota,
                pedagioLat, pedagioLon
            );

            if (distancia <= RAIO_DETECCAO_KM) {
                if (!pedagiosEncontrados.has(pedagio.ID)) {

                    let custo = eixo12;
                    if (eixos > 2) {
                        custo += eixoAdicional * (eixos - 2);
                    }

                    pedagioTotal += custo;
                    pedagiosEncontrados.add(pedagio.ID);
                    break;
                }
            }
        }
    }

    return {
        total: pedagioTotal,
        porEixo: pedagioTotal / (eixos > 0 ? eixos : 1)
    };
}

function calcularCustoCustomizado(geometriaRota, distanciaKM, duracaoMin, eixos) {

    const resultadosPedagio = calcularPedagios(geometriaRota, eixos);

    const precoCombustivel = parseFloat(document.getElementById('preco-combustivel').value);
    const consumo = parseFloat(document.getElementById('consumo').value);

    const combustivelTotal = consumo > 0 && precoCombustivel > 0
        ? (distanciaKM / consumo) * precoCombustivel
        : 0;

    atualizarResultados(distanciaKM, duracaoMin, resultadosPedagio.total, resultadosPedagio.porEixo, combustivelTotal);
}


// =================================================================
// 6. FUNÇÃO DE ATUALIZAÇÃO DA UI
// =================================================================

function atualizarResultados(distanciaKM, duracaoMin, pedagioTotal, pedagioPorEixo, combustivelTotal) {
    const custoTotal = pedagioTotal + combustivelTotal;

    document.getElementById('res-distancia').textContent = `${parseFloat(distanciaKM).toFixed(2).replace('.', ',')} KM`;
    document.getElementById('res-pedagio').textContent = `R$ ${pedagioTotal.toFixed(2).replace('.', ',')}`;
    document.getElementById('res-pedagio-eixo').textContent = `R$ ${pedagioPorEixo.toFixed(2).replace('.', ',')}`;
    document.getElementById('res-combustivel').textContent = `R$ ${combustivelTotal.toFixed(2).replace('.', ',')}`;
    document.getElementById('res-total').textContent = `R$ ${custoTotal.toFixed(2).replace('.', ',')}`;

    document.getElementById('resultados-rota').style.display = 'block';
}


// =================================================================
// 7. LISTENER PRINCIPAL DO FORMULÁRIO
// =================================================================

const formRota = document.getElementById('form-rota');
formRota.addEventListener('submit', async function (event) {
    event.preventDefault();

    const origemTexto = document.getElementById('origem').value;
    const destinoTexto = document.getElementById('destino').value;
    const eixos = parseInt(document.getElementById('eixos').value);

    const btnCalcular = document.getElementById('btn-calcular');
    btnCalcular.disabled = true;
    btnCalcular.textContent = 'BUSCANDO E CALCULANDO...';

    const coordsOrigem = await geocoding(origemTexto);
    const coordsDestino = await geocoding(destinoTexto);

    // Limpar marcadores de Origem/Destino e a rota anterior
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && (layer.options.title === 'Origem' || layer.options.title === 'Destino')) {
            map.removeLayer(layer);
        }
    });
    if (rotaAtualLayer) {
        map.removeLayer(rotaAtualLayer);
    }

    // Adicionar novos marcadores de Origem/Destino
    if (coordsOrigem) L.marker([coordsOrigem.lat, coordsOrigem.lon], { title: 'Origem' }).addTo(map).bindPopup("Origem");
    if (coordsDestino) L.marker([coordsDestino.lat, coordsDestino.lon], { title: 'Destino' }).addTo(map).bindPopup("Destino");

    if (!coordsOrigem || !coordsDestino) {
        alert("Erro: Não foi possível localizar a Origem ou o Destino. Tente um endereço mais específico.");
        btnCalcular.disabled = false;
        btnCalcular.textContent = 'CALCULAR ROTA';
        return;
    }

    await calcularERenderizarRota(coordsOrigem, coordsDestino, eixos);

    btnCalcular.disabled = false;
    btnCalcular.textContent = 'CALCULAR ROTA';
});


// =================================================================
// 8. EXECUÇÃO INICIAL
// =================================================================
carregarDadosMestres();
