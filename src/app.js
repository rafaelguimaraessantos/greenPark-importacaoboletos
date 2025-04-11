const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Boleto, Lote, Sequelize } = require('./models');
//serve para importar o Sequelize Operators, ou seja, os operadores especiais usados em consultas mais complexas no Sequelize 
const { Op } = require('sequelize');
const sequelize = require('./config/database'); 
const PDFParser = require('pdf-parse');
const pdf = require('pdf-lib');
// Caminho para a pasta onde os PDFs serão salvos
const PDF_OUTPUT_DIR = '/usr/src/app/src/pdfs';
// Caminho do diretório para upload de arquivos (se necessário)
const UPLOAD_DIR = path.join(__dirname, 'uploads');
//para o relatorio
const { PDFDocument, rgb,StandardFonts } = require('pdf-lib');
// Configurar multer para upload de arquivos
const upload = multer({ dest: UPLOAD_DIR });

const app = express();
app.use(express.json());


// Configurações globais
const MAPEAMENTO_UNIDADES = {
  '17': 3,  // Unidade 17 → Lote ID 3 (nome: 0017)
  '18': 6,  // Unidade 18 → Lote ID 6 (nome: 0018)
  '19': 7,  // Unidade 19 → Lote ID 7 (nome: 0019)
  '20': 8   // Unidade 20 → Lote ID 8 (nome: 0020)
};

// Criar diretório onde os PDFs serão salvos, se não existir
if (!fs.existsSync(PDF_OUTPUT_DIR)) {
  fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
  console.log('Diretório para salvar os PDFs criado:', PDF_OUTPUT_DIR);
}

// Criar diretório de upload, se não existir
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('Diretório de upload criado:', UPLOAD_DIR);
}


// Endpoint para importar CSV
app.post('/importar-csv', upload.single('csv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('Por favor, envie um arquivo CSV.');
  }

  const boletos = [];
  const resultados = {
    sucessos: 0,
    erros: [],
    lotes_nao_mapeados: [],
    boletos_duplicados: [],
    lotes_criados: 0
  };

  try {
    // Processamento do CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csvParser({ separator: ';' }))
        .on('data', (row) => {
          try {
            const boleto = {
              nome_sacado: row.nome,
              unidade: row.unidade,
              valor: parseFloat(row.valor.replace(',', '.')),
              linha_digitavel: row.linha_digitavel.trim(),
            };
            boletos.push(boleto);
          } catch (error) {
            resultados.erros.push(`Erro ao processar linha: ${error.message}`);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Processamento dos boletos com mapeamento
    for (const boleto of boletos) {
      try {
        // Verifica se a unidade está mapeada
        const loteId = MAPEAMENTO_UNIDADES[boleto.unidade];
        
        if (!loteId) {
          resultados.lotes_nao_mapeados.push(boleto.unidade);
          continue;
        }

        // Verifica ou cria o lote automaticamente
        const nomeLote = boleto.unidade.padStart(4, '0');
        const [lote, created] = await Lote.findOrCreate({
          where: { id: loteId },
          defaults: {
            id: loteId,
            nome: nomeLote,
            ativo: true,
            criado_em: new Date()
          }
        });

        if (created) {
          resultados.lotes_criados++;
          console.log(`Lote criado: ID ${loteId} (${nomeLote})`);
        }

        // Verifica consistência do nome do lote
        if (lote.nome !== nomeLote) {
          await lote.update({ nome: nomeLote });
          console.log(`Lote ID ${loteId} atualizado para nome ${nomeLote}`);
        }

        // Verifica se já existe boleto para este lote
        const boletoExistente = await Boleto.findOne({ 
          where: { id_lote: loteId } 
        });

        if (boletoExistente) {
          resultados.boletos_duplicados.push({
            unidade: boleto.unidade,
            lote_id: loteId,
            mensagem: `Já existe um boleto cadastrado para o lote ${loteId} (${nomeLote})`
          });
          console.log(`Boleto duplicado para lote ${loteId} (${nomeLote})`);
          continue;
        }

        // Cria o boleto
        await Boleto.create({
          nome_sacado: boleto.nome_sacado,
          id_lote: loteId,
          valor: boleto.valor,
          linha_digitavel: boleto.linha_digitavel,
        });

        resultados.sucessos++;
        console.log(`Boleto criado para lote ${loteId} (${nomeLote})`);

      } catch (error) {
        resultados.erros.push(`Erro ao processar boleto para unidade ${boleto.unidade}: ${error.message}`);
      }
    }

    // Resposta detalhada
    const resposta = {
      message: 'Processamento de CSV concluído',
      boletos_importados: resultados.sucessos,
      lotes_criados: resultados.lotes_criados,
      unidades_nao_mapeadas: [...new Set(resultados.lotes_nao_mapeados)],
      boletos_duplicados: resultados.boletos_duplicados,
      erros: resultados.erros
    };

    if (resultados.lotes_nao_mapeados.length > 0) {
      resposta.warning = `Unidades não mapeadas: ${[...new Set(resultados.lotes_nao_mapeados)].join(', ')}`;
    }

    if (resultados.boletos_duplicados.length > 0) {
      resposta.warning_duplicados = `${resultados.boletos_duplicados.length} boletos não importados (já existiam)`;
    }

    res.status(resultados.erros.length === 0 ? 200 : 207).json(resposta);

  } catch (error) {
    console.error('Erro geral:', error);
    res.status(500).json({
      message: 'Erro ao processar o arquivo CSV',
      error: error.message
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Endpoint para processar PDF de boletos com mapeamento por ordem fixa visto que foi dito no enuciado
//que o sindico sempre mandara em uma ordem fixa os boletos
app.post('/processar-pdf-boletos', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('Por favor, envie um arquivo PDF.');
  }

  const resultados = {
    totalPaginas: 0,
    boletosProcessados: 0,
    erros: [],
    mapeamento: []
  };

  try {
    // 1. Carregar o PDF
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfDoc = await pdf.PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    resultados.totalPaginas = pages.length;

    // 2. Obter todos os boletos ordenados por ID
    const boletos = await Boleto.findAll({
      order: [['id', 'ASC']] // Ordena por ID: 1-JOSE, 2-MARCOS, 3-MARCIA, 4-RAFAEL
    });

    // 3. Ordem ESPERADA das páginas no PDF (como o síndico envia)
    const ordemPaginasRecebidas = [
      'MARCIA', // Página 1 no PDF
      'JOSE',   // Página 2 no PDF
      'MARCOS', // Página 3 no PDF
      'RAFAEL'  // Página 4 no PDF
    ];

    // 4. Verificar consistência
    if (pages.length !== boletos.length || pages.length !== ordemPaginasRecebidas.length) {
      throw new Error(`Número de páginas (${pages.length}), boletos (${boletos.length}) ou ordem esperada (${ordemPaginasRecebidas.length}) não coincidem`);
    }

    // 5. Criar mapeamento página → nome
    const mapaPaginas = {};
    for (let i = 0; i < ordemPaginasRecebidas.length; i++) {
      mapaPaginas[ordemPaginasRecebidas[i]] = i;
    }

    // 6. Processar cada boleto na ORDEM DO BANCO DE DADOS (1,2,3,4)
    for (const boleto of boletos) {
      try {
        // Extrair primeiro nome do boleto (JOSE DA SILVA → JOSE)
        const primeiroNome = boleto.nome_sacado.split(' ')[0].toUpperCase();
        
        // Encontrar a página correta no PDF
        const paginaIndex = mapaPaginas[primeiroNome];
        
        if (paginaIndex === undefined) {
          throw new Error(`Página para ${primeiroNome} não encontrada no PDF`);
        }

        // Criar PDF individual
        const newPdf = await pdf.PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [paginaIndex]);
        newPdf.addPage(copiedPage);

        const pdfBytes = await newPdf.save();
        const outputPath = path.join(PDF_OUTPUT_DIR, `${boleto.id}.pdf`);

        fs.writeFileSync(outputPath, pdfBytes);
        
        resultados.boletosProcessados++;
        resultados.mapeamento.push({
          id_boleto: boleto.id,
          nome_boleto: boleto.nome_sacado,
          pagina_original: paginaIndex + 1,
          arquivo_gerado: outputPath,
          status: 'sucesso'
        });

        console.log(`Boleto ${boleto.id} (${boleto.nome_sacado}) salvo como ${boleto.id}.pdf`);
      } catch (error) {
        resultados.erros.push(`Erro ao processar boleto ${boleto.id}: ${error.message}`);
      }
    }

    // 7. Responder com resultados
    res.json({
      success: true,
      message: 'PDF processado com sucesso',
      ...resultados,
      outputDir: PDF_OUTPUT_DIR
    });

  } catch (error) {
    console.error('Erro ao processar PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar PDF',
      error: error.message
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});


// endpoint boletos
app.get('/boletos', async (req, res) => {
  try {
    const { nome, valor_inicial, valor_final, id_lote, relatorio } = req.query;

    const where = {};
    const include = [{
      model: Lote,
      attributes: ['id', 'nome']
    }];

    // Filtros existentes
    if (nome) {
      where[Op.and] = [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('nome_sacado')),
          'LIKE',
          `%${nome.toLowerCase()}%`
        )
      ];
    }

    if (valor_inicial || valor_final) {
      where.valor = {};
      if (valor_inicial) where.valor[Op.gte] = parseFloat(valor_inicial);
      if (valor_final) where.valor[Op.lte] = parseFloat(valor_final);
    }

    if (id_lote) {
      where.id_lote = id_lote;
    }

    const boletos = await Boleto.findAll({
      where,
      include,
      order: [['id', 'ASC']],
      raw: true, // Adicionado para garantir objetos simples
      nest: true // Mantém a estrutura de relacionamentos
    });

    // Se não for relatório, retorna JSON normal
    if (!relatorio || relatorio !== '1') {
      return res.json({
        quantidade: boletos.length,
        boletos
      });
    }

    // Criação do relatório PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    
    // Configurações do relatório
    const fontSize = 12;
    const margin = 50;
    const rowHeight = 25;
    const tableTop = height - margin;
    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
    const customColor = rgb(153 / 255, 0 / 255, 85 / 255); // #990055
    // Cabeçalho do relatório
    page.drawText('Relatório de Boletos', {
      x: margin,
      y: tableTop + 30,
      size: 16,
      font: courierFont,
      color: rgb(0, 0, 0),
    });
    // Cabeçalho com alinhamento perfeito
    const headerText = `ID   | Nome Sacado      | ID Lote    | Valor  | Linha Digitável       `;
    page.drawText(headerText, {
      x: margin,
      y: tableTop,
      size: fontSize, 
      font: courierFont, 
      color: rgb(0, 0, 0),
    });

    let y = tableTop - rowHeight;

    boletos.forEach(boleto => {
      const id = boleto.id.toString().padEnd(4);
      const nome = boleto.nome_sacado.padEnd(16);
      const idLote = boleto.id_lote.toString().padEnd(10);
      const valor = (parseFloat(boleto.valor).toFixed(2)).padStart(4); // alinhado à direita
      const linha = (boleto.linha_digitavel || '').padEnd(28);

      const linhaTexto = `${id}| ${nome}| ${idLote}| ${valor} | ${linha}`;
      let x = margin;
      // ID (cor personalizada)
      page.drawText(id, {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: customColor,
      });
      x += courierFont.widthOfTextAtSize(id, fontSize);

      // "|"
      page.drawText(' | ', {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: rgb(0, 0, 0),
      });
      x += courierFont.widthOfTextAtSize(' | ', fontSize);

      // Nome
      page.drawText(nome, {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: rgb(0, 0, 0),
      });
      x += courierFont.widthOfTextAtSize(nome, fontSize);

      // "|"
      page.drawText(' | ', {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: rgb(0, 0, 0),
      });
      x += courierFont.widthOfTextAtSize(' | ', fontSize);

      // ID Lote
      page.drawText(idLote, {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: customColor,
      });
      x += courierFont.widthOfTextAtSize(idLote, fontSize);

      // "|"
      page.drawText(' | ', {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: rgb(0, 0, 0),
      });
      x += courierFont.widthOfTextAtSize(' | ', fontSize);

      // Valor
      page.drawText(valor, {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: customColor,
      });
      x += courierFont.widthOfTextAtSize(valor, fontSize);

      // "|"
      page.drawText(' | ', {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: rgb(0, 0, 0),
      });
      x += courierFont.widthOfTextAtSize(' | ', fontSize);

      // Linha Digitável
      page.drawText(linha, {
        x,
        y,
        size: fontSize,
        font: courierFont,
        color: customColor,
      });
      y -= rowHeight;

      if (y < margin) {
        page.drawText('Continua na próxima página...', {
          x: margin,
          y: margin - 20,
          size: fontSize,
          font: courierFont,
          color: rgb(0, 0, 0)
        });
        y = tableTop - rowHeight;
      }
    });    
    // Salva o PDF em memória
    const pdfBytes = await pdfDoc.save();
    // Usa a constante já existente para o diretório
    const outputPath = path.join(PDF_OUTPUT_DIR, `relatorio_boletos_${Date.now()}.pdf`);

    // Salva o PDF diretamente no caminho especificado
    fs.writeFileSync(outputPath, pdfBytes);

    // Gera base64 caso ainda queira retornar no JSON
    const base64Pdf = Buffer.from(pdfBytes).toString('base64');

    // Retorna o PDF em base64
    res.json({
      quantidade: boletos.length,
      base64: base64Pdf
    });

  } catch (error) {
    console.error('Erro ao listar boletos:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.listen(3000, () => {
  console.log('Servidor rodando em http://localhost:3000');
});