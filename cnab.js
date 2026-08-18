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

// ---------- CNAB 400 (layout oficial Bradesco/Febraban — arquivo de RETORNO) ----------
const CNAB400_HEADER = [
  [1, 1, 'Tipo de registro', 'raw'],
  [2, 2, 'Código do registro (retorno)', 'raw'],
  [3, 9, 'Literal "RETORNO"', 'raw'],
  [10, 11, 'Código de serviço', 'raw'],
  [12, 26, 'Literal do serviço', 'raw'],
  [27, 46, 'Código da empresa', 'raw'],
  [47, 76, 'Nome da empresa (cedente)', 'raw'],
  [77, 79, 'Código do banco', 'bank'],
  [80, 94, 'Nome do banco', 'raw'],
  [95, 100, 'Data de gravação', 'date'],
  [109, 113, 'Nº do aviso bancário', 'raw'],
  [380, 385, 'Data do crédito', 'date'],
  [395, 400, 'Nº sequencial do registro', 'raw']
];

const CNAB400_DETALHE = [
  [1, 1, 'Tipo de registro', 'raw'],
  [2, 3, 'Tipo de inscrição do cedente', 'raw'],
  [4, 17, 'CNPJ/CPF do cedente', 'raw'],
  [21, 21, 'Zero (fixo)', 'raw'],
  [22, 24, 'Código da carteira', 'raw'],
  [25, 29, 'Agência do cedente (sem dígito)', 'raw'],
  [30, 36, 'Conta corrente do cedente', 'raw'],
  [37, 37, 'Dígito da conta', 'raw'],
  [38, 62, 'Nº de controle do participante (uso da empresa)', 'raw'],
  [71, 81, 'Nosso número', 'raw'],
  [82, 82, 'Dígito de autoconferência do nosso número', 'raw'],
  [108, 108, 'Carteira', 'raw'],
  [109, 110, 'Código de ocorrência', 'occurrence'],
  [111, 116, 'Data de ocorrência no banco', 'date'],
  [117, 126, 'Nº do documento (seu número)', 'raw'],
  [147, 152, 'Data de vencimento do título', 'date'],
  [153, 165, 'Valor do título', 'money'],
  [166, 168, 'Banco cobrador', 'bank'],
  [169, 173, 'Agência cobradora', 'raw'],
  [176, 188, 'Despesas de cobrança (tarifa)', 'money'],
  [189, 201, 'Outras despesas (custas de protesto)', 'money'],
  [202, 214, 'Juros da operação em atraso', 'money'],
  [215, 227, 'IOF devido', 'money'],
  [228, 240, 'Abatimento concedido sobre o título', 'money'],
  [241, 253, 'Desconto concedido', 'money'],
  [254, 266, 'Valor pago', 'money'],
  [267, 279, 'Juros de mora', 'money'],
  [280, 292, 'Outros créditos', 'money'],
  [296, 301, 'Data do crédito', 'date'],
  [319, 328, 'Motivos da ocorrência', 'raw'],
  [395, 400, 'Nº sequencial do registro', 'raw']
];

const CNAB400_TRAILER = [
  [1, 1, 'Tipo de registro', 'raw'],
  [2, 2, 'Identificação do retorno', 'raw'],
  [5, 7, 'Código do banco', 'bank'],
  [18, 25, 'Quantidade de títulos em cobrança', 'raw'],
  [26, 39, 'Valor total em cobrança', 'money'],
  [58, 62, 'Qtde. registros ocorrência 02 (entrada confirmada)', 'raw'],
  [63, 74, 'Valor registros ocorrência 02', 'money'],
  [75, 86, 'Valor registros ocorrência 06 (liquidação)', 'money'],
  [87, 91, 'Qtde. registros ocorrência 06', 'raw'],
  [104, 108, 'Qtde. registros ocorrência 09/10 (baixados)', 'raw'],
  [109, 120, 'Valor registros ocorrência 09/10', 'money'],
  [395, 400, 'Nº sequencial do registro', 'raw']
];

const OCCURRENCE_CODES = {
  '02': 'Entrada confirmada',
  '03': 'Entrada rejeitada',
  '06': 'Liquidação normal',
  '07': 'Confirmação de exclusão de cadastro do pagador (débito)',
  '08': 'Rejeição do pedido de exclusão de cadastro do pagador (débito)',
  '09': 'Baixado automaticamente via arquivo',
  '10': 'Baixado conforme instruções da agência',
  '11': 'Em ser — arquivo de títulos pendentes',
  '12': 'Abatimento concedido',
  '13': 'Abatimento cancelado',
  '14': 'Vencimento alterado',
  '15': 'Liquidação em cartório',
  '16': 'Título pago em cheque — vinculado',
  '17': 'Liquidação após baixa ou título não registrado',
  '18': 'Acerto de depositária',
  '19': 'Confirmação de recebimento de instrução de protesto',
  '20': 'Confirmação de recebimento de instrução de sustação de protesto',
  '21': 'Acerto do controle do participante',
  '22': 'Título com pagamento cancelado',
  '23': 'Entrada do título em cartório',
  '24': 'Entrada rejeitada por CEP irregular',
  '25': 'Confirmação de recebimento de instrução de protesto falimentar',
  '27': 'Baixa rejeitada',
  '28': 'Débito de tarifas/custas',
  '29': 'Ocorrências do pagador',
  '30': 'Alteração de outros dados rejeitados',
  '31': 'Confirmado inclusão de cadastro do pagador',
  '32': 'Instrução rejeitada',
  '33': 'Confirmação de pedido de alteração de outros dados',
  '34': 'Retirado de cartório e mantido em carteira',
  '35': 'Desagendamento do débito automático',
  '40': 'Estorno de pagamento',
  '55': 'Sustado judicial'
};

const REMESSA_INSTRUCTION_CODES = {
  '01': 'Remessa (entrada de título)',
  '02': 'Pedido de baixa',
  '03': 'Pedido de protesto falimentar',
  '04': 'Concessão de abatimento',
  '05': 'Cancelamento de abatimento concedido',
  '06': 'Alteração de vencimento',
  '07': 'Alteração do controle do participante',
  '08': 'Alteração de seu número',
  '09': 'Pedido de protesto',
  '18': 'Sustar protesto e baixar título',
  '19': 'Sustar protesto e manter em carteira',
  '31': 'Alteração de outros dados'
};

// ---------- CNAB 400 (layout oficial Bradesco/Febraban — arquivo de REMESSA) ----------
const CNAB400_REMESSA_HEADER = [
  [1, 1, 'Tipo de registro', 'raw'],
  [2, 2, 'Código do registro (remessa)', 'raw'],
  [3, 9, 'Literal "REMESSA"', 'raw'],
  [10, 11, 'Código de serviço', 'raw'],
  [12, 26, 'Literal do serviço', 'raw'],
  [27, 46, 'Código da empresa', 'raw'],
  [47, 76, 'Nome da empresa (cedente)', 'raw'],
  [77, 79, 'Código do banco', 'bank'],
  [80, 94, 'Nome do banco', 'raw'],
  [95, 100, 'Data de gravação', 'date'],
  [111, 117, 'Nº sequencial de remessa', 'raw'],
  [395, 400, 'Nº sequencial do registro', 'raw']
];

const CNAB400_REMESSA_DETALHE = [
  [1, 1, 'Tipo de registro', 'raw'],
  [21, 21, 'Zero (fixo)', 'raw'],
  [22, 24, 'Código da carteira', 'raw'],
  [25, 29, 'Agência do cedente (sem dígito)', 'raw'],
  [30, 36, 'Conta corrente do cedente', 'raw'],
  [37, 37, 'Dígito da conta', 'raw'],
  [38, 62, 'Nº de controle do participante (uso da empresa)', 'raw'],
  [71, 81, 'Nosso número', 'raw'],
  [82, 82, 'Dígito de autoconferência do nosso número', 'raw'],
  [109, 110, 'Código de instrução/ocorrência', 'remInstruction'],
  [111, 120, 'Nº do documento (seu número)', 'raw'],
  [121, 126, 'Data de vencimento', 'date'],
  [127, 139, 'Valor do título', 'money'],
  [148, 149, 'Espécie do título', 'raw'],
  [151, 156, 'Data de emissão do título', 'date'],
  [157, 158, '1ª instrução', 'raw'],
  [159, 160, '2ª instrução', 'raw'],
  [161, 173, 'Valor a ser cobrado por dia de atraso (mora)', 'money'],
  [174, 179, 'Data limite para concessão de desconto', 'date'],
  [180, 192, 'Valor do desconto', 'money'],
  [193, 205, 'Valor do IOF', 'money'],
  [206, 218, 'Valor do abatimento a conceder', 'money'],
  [219, 220, 'Tipo de inscrição do pagador', 'raw'],
  [221, 234, 'CNPJ/CPF do pagador', 'raw'],
  [235, 274, 'Nome do pagador', 'raw'],
  [275, 314, 'Endereço completo do pagador', 'raw'],
  [327, 331, 'CEP do pagador', 'raw'],
  [332, 334, 'Sufixo do CEP', 'raw'],
  [395, 400, 'Nº sequencial do registro', 'raw']
];

// ---------- CNAB 240 remessa — segmentos P, Q, R ----------
const CNAB240_SEGMENTO_P = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [9, 13, 'Nº sequencial do registro no lote', 'raw'],
  [14, 14, 'Segmento', 'raw'],
  [18, 22, 'Agência cedente', 'raw'],
  [23, 29, 'Conta cedente', 'raw'],
  [38, 62, 'Nosso número', 'raw'],
  [63, 63, 'Código da carteira', 'raw'],
  [74, 88, 'Nº do documento (seu número)', 'raw'],
  [89, 96, 'Data de vencimento', 'date'],
  [97, 111, 'Valor do título', 'money'],
  [151, 158, 'Data de emissão do título', 'date'],
  [159, 160, '1ª instrução', 'remInstruction'],
  [174, 188, 'Valor de mora/dia', 'money'],
  [189, 196, 'Data limite de desconto', 'date'],
  [197, 211, 'Valor de desconto', 'money'],
  [212, 226, 'Valor de IOF', 'money'],
  [227, 241, 'Valor de abatimento', 'money']
];

const CNAB240_SEGMENTO_Q = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [9, 13, 'Nº sequencial do registro no lote', 'raw'],
  [14, 14, 'Segmento', 'raw'],
  [18, 18, 'Tipo de inscrição do sacado', 'raw'],
  [19, 33, 'CNPJ/CPF do sacado', 'raw'],
  [34, 73, 'Nome do sacado', 'raw'],
  [74, 113, 'Endereço do sacado', 'raw'],
  [114, 128, 'Bairro do sacado', 'raw'],
  [129, 133, 'CEP do sacado', 'raw'],
  [136, 150, 'Cidade do sacado', 'raw'],
  [151, 152, 'UF do sacado', 'raw']
];

const CNAB240_SEGMENTO_R = [
  [1, 3, 'Código do banco', 'bank'],
  [4, 7, 'Lote de serviço', 'raw'],
  [8, 8, 'Tipo de registro', 'raw'],
  [9, 13, 'Nº sequencial do registro no lote', 'raw'],
  [14, 14, 'Segmento', 'raw'],
  [18, 18, 'Código do desconto 2', 'raw'],
  [19, 26, 'Data do desconto 2', 'date'],
  [27, 41, 'Valor do desconto 2', 'money'],
  [42, 42, 'Código da multa', 'raw'],
  [43, 50, 'Data da multa', 'date'],
  [51, 65, 'Valor da multa', 'money'],
  [76, 90, 'Valor do abatimento não aproveitado', 'money'],
  [91, 220, 'Mensagem livre', 'raw']
];

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
    case 'remInstruction': return REMESSA_INSTRUCTION_CODES[value] ? `${value} — ${REMESSA_INSTRUCTION_CODES[value]}` : (value || '—');
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

function detectFileKind400(headerLine) {
  // posição 2 do header: '1' = remessa, '2' = retorno (padrão Febraban)
  const marker = headerLine[1];
  if (marker === '1') return 'remessa';
  if (marker === '2') return 'retorno';
  return 'retorno';
}

function parseCNAB400(lines, forcedKind) {
  const records = [];
  const kind = forcedKind || (lines.length ? detectFileKind400(lines[0]) : 'retorno');
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const tipo = line[0];
    let layout, tipoLabel;
    if (tipo === '0') {
      layout = kind === 'remessa' ? CNAB400_REMESSA_HEADER : CNAB400_HEADER;
      tipoLabel = kind === 'remessa' ? 'Header do arquivo (remessa)' : 'Header do arquivo (retorno)';
    } else if (tipo === '9' && idx === lines.length - 1) {
      layout = CNAB400_TRAILER; tipoLabel = 'Trailer do arquivo';
    } else if (tipo === '1') {
      if (kind === 'remessa') { layout = CNAB400_REMESSA_DETALHE; tipoLabel = 'Detalhe (instrução de cobrança)'; }
      else { layout = CNAB400_DETALHE; tipoLabel = 'Detalhe (movimento)'; }
    } else { layout = CNAB400_TRAILER; tipoLabel = 'Trailer do arquivo'; }
    records.push({
      lineNumber: idx + 1, tipoLabel, tipoRegistro: tipo,
      length: line.length,
      valid: line.length === 400,
      fields: extractFields(line, layout)
    });
  });
  return { records, kind };
}

function detectFileKind240(headerLine) {
  // posição 143 do header de arquivo: '1' = remessa, '2' = retorno
  const marker = headerLine.length >= 143 ? headerLine[142] : null;
  if (marker === '1') return 'remessa';
  if (marker === '2') return 'retorno';
  return 'retorno';
}

function parseCNAB240(lines, forcedKind) {
  const records = [];
  const kind = forcedKind || (lines.length ? detectFileKind240(lines[0]) : 'retorno');
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const tipoRegistro = line[7]; // posição 8
    let layout, tipoLabel;
    if (tipoRegistro === '0') { layout = CNAB240_HEADER_ARQUIVO; tipoLabel = `Header do arquivo (${kind})`; }
    else if (tipoRegistro === '1') { layout = CNAB240_HEADER_LOTE; tipoLabel = 'Header de lote'; }
    else if (tipoRegistro === '5') { layout = CNAB240_TRAILER_LOTE; tipoLabel = 'Trailer de lote'; }
    else if (tipoRegistro === '9') { layout = CNAB240_TRAILER_ARQUIVO; tipoLabel = 'Trailer do arquivo'; }
    else if (tipoRegistro === '3') {
      const segmento = line[13]; // posição 14
      if (kind === 'remessa') {
        if (segmento === 'P') { layout = CNAB240_SEGMENTO_P; tipoLabel = 'Detalhe — Segmento P (título)'; }
        else if (segmento === 'Q') { layout = CNAB240_SEGMENTO_Q; tipoLabel = 'Detalhe — Segmento Q (sacado)'; }
        else if (segmento === 'R') { layout = CNAB240_SEGMENTO_R; tipoLabel = 'Detalhe — Segmento R (descontos/multa)'; }
        else { layout = CNAB240_SEGMENTO_P; tipoLabel = `Detalhe — Segmento ${segmento || '?'}`; }
      } else {
        if (segmento === 'U') { layout = CNAB240_SEGMENTO_U; tipoLabel = 'Detalhe — Segmento U (valores)'; }
        else { layout = CNAB240_SEGMENTO_T; tipoLabel = `Detalhe — Segmento ${segmento || '?'}`; }
      }
    } else { layout = CNAB240_SEGMENTO_T; tipoLabel = 'Detalhe'; }
    records.push({
      lineNumber: idx + 1, tipoLabel, tipoRegistro,
      length: line.length,
      valid: line.length === 240,
      fields: extractFields(line, layout)
    });
  });
  return { records, kind };
}

function detectAndParse(rawText, forcedKind) {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return { type: 'desconhecido', records: [], kind: 'retorno' };

  const lens = lines.map(l => l.length);
  const mostCommon = lens.sort((a, b) =>
    lens.filter(v => v === a).length - lens.filter(v => v === b).length
  ).pop();

  let type, parsed;
  if (mostCommon === 240) { type = 'CNAB 240'; parsed = parseCNAB240(lines, forcedKind); }
  else if (mostCommon === 400) { type = 'CNAB 400'; parsed = parseCNAB400(lines, forcedKind); }
  else if (mostCommon > 320) { type = 'CNAB 400 (tamanho de linha divergente)'; parsed = parseCNAB400(lines, forcedKind); }
  else { type = 'CNAB 240 (tamanho de linha divergente)'; parsed = parseCNAB240(lines, forcedKind); }

  return { type, records: parsed.records, kind: parsed.kind };
}
