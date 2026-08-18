// cnab.js — parser client-side para arquivos de retorno bancário CNAB 400 e CNAB 240
// Nenhum dado sai do navegador: tudo é processado localmente.

const BANK_CODES = {
  '001': 'Banco do Brasil', '033': 'Santander', '104': 'Caixa Econômica Federal',
  '237': 'Bradesco', '341': 'Itaú', '399': 'HSBC', '422': 'Safra',
  '748': 'Sicredi', '756': 'Sicoob', '077': 'Inter', '212': 'Banco Original',
  '336': 'C6 Bank', '655': 'Banco Votorantim', '041': 'Banrisul'
};

function seg(line, start, end) {
  // posições 1-indexadas, inclusive, conforme documentação Febraban
  return line.slice(start - 1, end).trim();
}

function segRaw(line, start, end) {
  return line.slice(start - 1, end);
}

function money(str, decimals = 2) {
  const digits = str.replace(/\D/g, '') || '0';
  const n = parseInt(digits, 10) / Math.pow(10, decimals);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function dateBR(str) {
  // DDMMAA ou DDMMAAAA
  if (str.length === 6) {
    const d = str.slice(0, 2), m = str.slice(2, 4), y = str.slice(4, 6);
    if (d === '00' || m === '00') return '—';
    return `${d}/${m}/20${y}`;
  }
  if (str.length === 8) {
    const d = str.slice(0, 2), m = str.slice(2, 4), y = str.slice(4, 8);
    if (d === '00' || m === '00') return '—';
    return `${d}/${m}/${y}`;
  }
  return str;
}

// ---------- CNAB 400 (layout genérico Febraban de retorno de cobrança) ----------
const CNAB400_HEADER = [
  [1, 1, 'Tipo de registro', 'raw'],
  [2, 2, 'Código do registro (retorno)', 'raw'],
  [3, 9, 'Literal "RETORNO"', 'raw'],
  [10, 11, 'Código de serviço', 'raw'],
  [12, 26, 'Literal do serviço', 'raw'],
  [27, 46, 'Código/CNPJ da empresa', 'raw'],
  [47, 76, 'Nome da empresa (cedente)', 'raw'],
  [77, 79, 'Código do banco', 'bank'],
  [80, 94, 'Nome do banco', 'raw'],
  [95, 100, 'Data de gravação', 'date'],
  [101, 110, 'Nº sequencial de remessa', 'raw'],
  [111, 116, 'Data do retorno (processamento)', 'date'],
  [391, 394, 'Nº sequencial do registro', 'raw']
];

const CNAB400_DETALHE = [
  [1, 1, 'Tipo de registro', 'raw'],
  [2, 3, 'Tipo de inscrição do cedente', 'raw'],
  [4, 17, 'CNPJ/CPF do cedente', 'raw'],
  [18, 19, 'Agência do cedente', 'raw'],
  [20, 26, 'Conta do cedente', 'raw'],
  [27, 37, 'Nosso número', 'raw'],
  [38, 38, 'Dígito do nosso número', 'raw'],
  [63, 65, 'Código de ocorrência', 'occurrence'],
  [66, 73, 'Data de ocorrência', 'date'],
  [74, 84, 'Nº do documento (seu número)', 'raw'],
  [111, 120, 'Valor do título', 'money'],
  [147, 150, 'Código do banco cobrador', 'bank'],
  [176, 188, 'Valor do IOF', 'money'],
  [189, 201, 'Valor do abatimento', 'money'],
  [202, 214, 'Valor de desconto concedido', 'money'],
  [215, 227, 'Valor pago pelo sacado', 'money'],
  [228, 240, 'Valor de juros/mora', 'money'],
  [241, 253, 'Valor de outros créditos', 'money'],
  [254, 261, 'Data de crédito', 'date'],
  [391, 394, 'Nº sequencial do registro', 'raw']
];

const CNAB400_TRAILER = [
  [1, 1, 'Tipo de registro', 'raw'],
  [2, 4, 'Código do banco', 'bank'],
  [18, 24, 'Quantidade de títulos cobrança simples', 'raw'],
  [25, 39, 'Valor total dos títulos', 'money'],
  [391, 394, 'Nº sequencial do registro', 'raw']
];

const OCCURRENCE_CODES = {
  '02': 'Confirmação de entrada de título',
  '03': 'Título pago com dinheiro / rejeição de entrada',
  '06': 'Liquidação normal',
  '09': 'Baixa/liquidado (arquivo do cedente)',
  '10': 'Baixado conforme instruções da agência',
  '11': 'Título em ser (arquivo do cedente)',
  '12': 'Abatimento concedido',
  '13': 'Abatimento cancelado',
  '14': 'Alteração de vencimento',
  '15': 'Liquidação em cartório',
  '17': 'Liquidação após baixa ou título não registrado',
  '19': 'Confirmação de recebimento de instrução de protesto',
  '20': 'Confirmação de recebimento de instrução de sustação de protesto',
  '23': 'Remessa a cartório',
  '24': 'Retirada de cartório e manutenção em carteira',
  '25': 'Protestado e baixado',
  '28': 'Débito de tarifas/custas',
  '29': 'Ocorrências do sacado',
  '30': 'Alteração de outros dados'
};

// ---------- CNAB 240 (layout genérico Febraban) ----------
const CNAB240_HEADER_ARQUIVO = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [18, 32, 'CNPJ/CPF da empresa', 'raw'],
  [73, 102, 'Nome da empresa', 'raw'],
  [103, 132, 'Nome do banco', 'raw'],
  [143, 143, 'Código remessa/retorno (1=remessa,2=retorno)', 'raw'],
  [144, 151, 'Data de geração do arquivo', 'date'],
  [152, 157, 'Hora de geração do arquivo', 'raw'],
  [158, 163, 'Nº sequencial do arquivo', 'raw'],
  [164, 166, 'Nº da versão do layout', 'raw']
];

const CNAB240_HEADER_LOTE = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [9, 9, 'Tipo de operação', 'raw'],
  [10, 11, 'Tipo de serviço', 'raw'],
  [18, 32, 'CNPJ/CPF da empresa', 'raw'],
  [73, 102, 'Nome da empresa (cedente)', 'raw'],
  [143, 182, 'Endereço/logradouro', 'raw']
];

const CNAB240_SEGMENTO_T = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [9, 13, 'Nº sequencial do registro no lote', 'raw'],
  [14, 14, 'Segmento', 'raw'],
  [18, 22, 'Agência cobradora', 'raw'],
  [23, 29, 'Conta cobradora', 'raw'],
  [38, 62, 'Nosso número', 'raw'],
  [63, 63, 'Carteira', 'raw'],
  [74, 88, 'Nº do documento (seu número)', 'raw'],
  [89, 96, 'Data de vencimento', 'date'],
  [97, 111, 'Valor do título', 'money'],
  [123, 126, 'Código da carteira/banco cobrador', 'raw'],
  [147, 154, 'Data de ocorrência', 'date'],
  [215, 217, 'Código de ocorrência/motivo', 'raw']
];

const CNAB240_SEGMENTO_U = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [9, 13, 'Nº sequencial do registro no lote', 'raw'],
  [14, 14, 'Segmento', 'raw'],
  [17, 29, 'Valor do IOF', 'money'],
  [30, 42, 'Valor do abatimento', 'money'],
  [43, 55, 'Valor do desconto', 'money'],
  [56, 68, 'Valor do principal pago (título liquidado)', 'money'],
  [69, 81, 'Valor de juros/mora', 'money'],
  [82, 94, 'Valor de outros créditos', 'money'],
  [95, 102, 'Data de ocorrência/crédito', 'date'],
  [103, 110, 'Data de crédito', 'date']
];

const CNAB240_TRAILER_LOTE = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [18, 23, 'Quantidade de registros do lote', 'raw']
];

const CNAB240_TRAILER_ARQUIVO = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [18, 23, 'Quantidade de lotes do arquivo', 'raw'],
  [24, 29, 'Quantidade de registros do arquivo', 'raw']
];

function classify(value, kind) {
  switch (kind) {
    case 'bank': return BANK_CODES[value] ? `${value} — ${BANK_CODES[value]}` : (value || '—');
    case 'date': return dateBR(value);
    case 'money': return value ? `R$ ${money(value)}` : '—';
    case 'occurrence': return OCCURRENCE_CODES[value] ? `${value} — ${OCCURRENCE_CODES[value]}` : (value || '—');
    default: return value || '—';
  }
}

function extractFields(line, layout) {
  return layout.map(([start, end, label, kind]) => ({
    start, end, label,
    raw: segRaw(line, start, end),
    value: classify(seg(line, start, end), kind)
  }));
}

function parseCNAB400(lines) {
  const records = [];
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const tipo = line[0];
    let layout, tipoLabel;
    if (tipo === '0') { layout = CNAB400_HEADER; tipoLabel = 'Header do arquivo'; }
    else if (tipo === '9' && idx === lines.length - 1) { layout = CNAB400_TRAILER; tipoLabel = 'Trailer do arquivo'; }
    else if (tipo === '1') { layout = CNAB400_DETALHE; tipoLabel = 'Detalhe (movimento)'; }
    else { layout = CNAB400_TRAILER; tipoLabel = 'Trailer do arquivo'; }
    records.push({
      lineNumber: idx + 1, tipoLabel, tipoRegistro: tipo,
      length: line.length,
      valid: line.length === 400,
      fields: extractFields(line, layout)
    });
  });
  return records;
}

function parseCNAB240(lines) {
  const records = [];
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const tipoRegistro = line[7]; // posição 8
    let layout, tipoLabel;
    if (tipoRegistro === '0') { layout = CNAB240_HEADER_ARQUIVO; tipoLabel = 'Header do arquivo'; }
    else if (tipoRegistro === '1') { layout = CNAB240_HEADER_LOTE; tipoLabel = 'Header de lote'; }
    else if (tipoRegistro === '5') { layout = CNAB240_TRAILER_LOTE; tipoLabel = 'Trailer de lote'; }
    else if (tipoRegistro === '9') { layout = CNAB240_TRAILER_ARQUIVO; tipoLabel = 'Trailer do arquivo'; }
    else if (tipoRegistro === '3') {
      const segmento = line[13]; // posição 14
      if (segmento === 'U') { layout = CNAB240_SEGMENTO_U; tipoLabel = 'Detalhe — Segmento U (valores)'; }
      else { layout = CNAB240_SEGMENTO_T; tipoLabel = `Detalhe — Segmento ${segmento || '?'}`; }
    } else { layout = CNAB240_SEGMENTO_T; tipoLabel = 'Detalhe'; }
    records.push({
      lineNumber: idx + 1, tipoLabel, tipoRegistro,
      length: line.length,
      valid: line.length === 240,
      fields: extractFields(line, layout)
    });
  });
  return records;
}

function detectAndParse(rawText) {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return { type: 'desconhecido', records: [] };

  const lens = lines.map(l => l.length);
  const mostCommon = lens.sort((a, b) =>
    lens.filter(v => v === a).length - lens.filter(v => v === b).length
  ).pop();

  if (mostCommon === 240) return { type: 'CNAB 240', records: parseCNAB240(lines) };
  if (mostCommon === 400) return { type: 'CNAB 400', records: parseCNAB400(lines) };
  // fallback: tenta pelo tamanho mais próximo
  if (mostCommon > 320) return { type: 'CNAB 400 (tamanho de linha divergente)', records: parseCNAB400(lines) };
  return { type: 'CNAB 240 (tamanho de linha divergente)', records: parseCNAB240(lines) };
}
