import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph } from 'docx';
import pdfParse from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';

import { pipeline, env } from '@xenova/transformers';
import { fileURLToPath } from 'url';
import { createAnonymizer } from './src/pii/anonymizer.js';
import { createPseudonymizer } from './src/pii/pseudonymizer.js';
import { createNerDetector } from './src/pii/detectors/nerDetector.js';
import { writePdf } from './src/pdfWriter.js';

// DEV: force Pro mode (no daily limit, always emit mapping). // TODO: revert before release
const DEV_FORCE_PRO = true;

// ES module paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Transformers.js environment
env.localModelPath = path.join(__dirname, 'models');
env.allowRemoteModels = false;
env.quantized = false;

// Toggle whether we use LLM-based anonymization
const useLLM = true;

// Pipeline reference
let nerPipeline = null;

/**
 * Loads the PII detection model from local files, if not already loaded.
 */
async function loadNERModel() {
  if (!nerPipeline) {
    console.log("Loading PII detection model from local files...");
    // TODO(Phase 9): switch to 'Babelscape/wikineural-multilingual-ner'
    nerPipeline = await pipeline('token-classification', 'protectai/lakshyakh93-deberta_finetuned_pii-onnx');
    console.log("Model loaded.");
  }
  return nerPipeline;
}

/**
 * The main anonymization function.
 * Uses the offset-based PII engine (createAnonymizer + createNerDetector).
 * Returns the anonymized string. Uses the per-file shared pseudonymizer so
 * all cells/paragraphs within one processFile call share consistent numbering
 * and accumulate into a single mapping.
 */
let sharedPseudonymizer = createPseudonymizer();
let sharedAnonymizer = null;

/** Reset the per-file shared pseudonymizer (call once at the start of processFile). */
function resetMapping() {
  sharedPseudonymizer = createPseudonymizer();
  sharedAnonymizer = null; // will be re-created lazily on first anonymizeText call
}

export function getLastMapping() { return sharedPseudonymizer.mapping; }

async function anonymizeText(text) {
  if (!sharedAnonymizer) {
    const pipe = await loadNERModel();
    const ner = createNerDetector({ runPipeline: (t) => pipe(t) });
    sharedAnonymizer = createAnonymizer({ ner, pseudonymizer: sharedPseudonymizer });
  }
  const { text: out } = await sharedAnonymizer.anonymize(text);
  return out;
}

export class FileProcessor {
  static async processFile(filePath, outputPath) {
    // Helper: write the reversible mapping JSON when Pro mode is active.
    function writeMapping(outPath) {
      if (DEV_FORCE_PRO) {
        try { fs.writeFileSync(outPath + '.mapping.json', JSON.stringify(getLastMapping(), null, 2), 'utf8'); }
        catch (e) { console.warn('mapping write failed:', e.message); }
      }
    }

    // Reset the per-file shared pseudonymizer so all cells/paragraphs share
    // consistent numbering and accumulate into one mapping for this file.
    resetMapping();

    return new Promise(async (resolve, reject) => {
      try {
        const ext = path.extname(filePath).toLowerCase();
        console.log(`Processing file: ${filePath}`);

        if (ext === '.txt' || ext === '.csv') {
          // Text-based approach
          console.log(`Processing text file: ${filePath}`);
          const content = fs.readFileSync(filePath, 'utf8');
          let newContent;
          if (useLLM) {
            console.log("LLM anonymization enabled. Processing text...");
            const anonymizedText = await anonymizeText(content);
            newContent = "Anonymized\n\n" + anonymizedText;
          } else {
            console.log("LLM anonymization disabled. Using default processing.");
            newContent = "Anonymized\n\n" + content;
          }
          fs.writeFileSync(outputPath, newContent, 'utf8');
          console.log(`Text file processed and saved to: ${outputPath}`);
          writeMapping(outputPath);
          resolve(true);

        } else if (ext === '.xlsx') {
          // Excel partial coverage
          console.log(`Processing Excel file: ${filePath}`);
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.readFile(filePath);

          for (const worksheet of workbook.worksheets) {
            for (let i = 1; i <= worksheet.rowCount; i++) {
              const row = worksheet.getRow(i);
              for (let j = 1; j <= row.cellCount; j++) {
                const cell = row.getCell(j);
                if (typeof cell.value === 'string') {
                  console.log(`Anonymizing cell [Row ${i}, Col ${j}] with value: ${cell.value}`);
                  cell.value = await anonymizeText(cell.value);
                }
              }
            }
          }

          await workbook.xlsx.writeFile(outputPath);
          console.log(`Excel file processed and saved to: ${outputPath}`);
          writeMapping(outputPath);
          resolve(true);

        } else if (ext === '.docx') {
          // DOCX: mammoth + docx approach
          console.log(`Processing DOCX file: ${filePath}`);
          const { value: docxText } = await mammoth.extractRawText({ path: filePath });
          console.log("Extracted DOCX text:", docxText);

          let anonymizedDocxText = docxText;
          if (useLLM) {
            anonymizedDocxText = await anonymizeText(docxText);
          }

          // Create minimal docx with 'docx' library
          const doc = new Document({
            sections: [
              {
                children: [ new Paragraph(anonymizedDocxText) ],
              },
            ],
          });
          const buffer = await Packer.toBuffer(doc);
          fs.writeFileSync(outputPath, buffer);
          console.log(`DOCX file processed and saved to: ${outputPath}`);
          writeMapping(outputPath);
          resolve(true);

        } else if (ext === '.pdf') {
          // PDF: pdf-parse + pdf-lib approach
          console.log(`Processing PDF file: ${filePath}`);
          const dataBuffer = fs.readFileSync(filePath);
          const data = await pdfParse(dataBuffer);
          const pdfText = data.text;
          console.log("Extracted PDF text:", pdfText);

          let anonymizedPdfText = pdfText;
          if (useLLM) {
            anonymizedPdfText = await anonymizeText(pdfText);
          }

          const packagedFont = process.resourcesPath ? path.join(process.resourcesPath, 'fonts', 'DejaVuSans.ttf') : null;
          const fontPath = (packagedFont && fs.existsSync(packagedFont)) ? packagedFont : path.join(__dirname, 'assets', 'fonts', 'DejaVuSans.ttf');
          await writePdf(PDFDocument, anonymizedPdfText, fontPath, outputPath);
          console.log(`PDF file processed and saved to: ${outputPath}`);
          writeMapping(outputPath);
          resolve(true);

        } else {
          // For other file types, just copy
          console.log(`Processing binary file: ${filePath}`);
          fs.copyFileSync(filePath, outputPath);
          console.log(`Binary file copied to: ${outputPath}`);
          resolve(true);
        }
      } catch (error) {
        console.error("Error in processFile:", error);
        reject(error);
      }
    });
  }

  static generateOutputFileName(originalName) {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${baseName}-anon${ext}`;
  }

  static validateFileType(filePath) {
    const supportedTypes = [
      '.doc', '.docx', '.xls', '.xlsx', '.csv', '.pdf', '.txt'
    ];
    const ext = path.extname(filePath).toLowerCase();
    return supportedTypes.includes(ext);
  }
}
