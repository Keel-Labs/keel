import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { FileManager } from '../fileManager';
import { ingestWikiSource } from '../workflows/wikiIngest';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wiki-ingest-'));
  fm = new FileManager(tmpDir);
  await fm.writeFile('knowledge-bases/test-base/overview.md', '# Test Base\n');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ingestWikiSource', () => {
  it('creates a normalized source package and wiki source page for pasted text', async () => {
    const result = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'text',
      title: 'Research Notes',
      text: 'These are the first notes.\n\nThey should become a wiki source page.',
    }, fm);

    expect(result.relativePagePath).toBe('wiki/sources/research-notes.md');

    const rawSource = await fm.readFile('knowledge-bases/test-base/raw/research-notes/source.md');
    expect(rawSource).toContain('# Research Notes');
    expect(rawSource).toContain('These are the first notes.');

    const metadata = await fm.readFile('knowledge-bases/test-base/raw/research-notes/metadata.json');
    expect(metadata).toContain('"sourceType": "text"');
    expect(metadata).toContain('"status": "ready"');

    const wikiSourcePage = await fm.readFile('knowledge-bases/test-base/wiki/sources/research-notes.md');
    expect(wikiSourcePage).toContain('# Research Notes');
    expect(wikiSourcePage).toContain('## Source Metadata');
    expect(wikiSourcePage).toContain('## Excerpt');

    const wikiIndex = await fm.readFile('knowledge-bases/test-base/wiki/index.md');
    expect(wikiIndex).toContain('- [Research Notes](wiki/sources/research-notes.md)');

    const wikiLog = await fm.readFile('knowledge-bases/test-base/wiki/log.md');
    expect(wikiLog).toContain('ingest | Research Notes');
  });

  it('prepends newer ingest entries to the top of the wiki log', async () => {
    await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'text',
      title: 'First Source',
      text: 'First body.',
    }, fm);

    await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'text',
      title: 'Second Source',
      text: 'Second body.',
    }, fm);

    const wikiLog = await fm.readFile('knowledge-bases/test-base/wiki/log.md');
    expect(wikiLog.indexOf('ingest | Second Source')).toBeLessThan(wikiLog.indexOf('ingest | First Source'));
  });

  it('imports markdown files and generates unique source slugs', async () => {
    const importedPath = path.join(tmpDir, 'outside-notes.md');
    await fs.writeFile(importedPath, '# Imported Notes\n\nA markdown file from outside the brain.\n', 'utf-8');

    const first = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'file',
      filePath: importedPath,
      fileName: 'outside-notes.md',
    }, fm);

    const second = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'file',
      filePath: importedPath,
      fileName: 'outside-notes.md',
    }, fm);

    expect(first.sourceSlug).toBe('imported-notes');
    expect(second.sourceSlug).toBe('imported-notes-2');

    const secondPage = await fm.readFile('knowledge-bases/test-base/wiki/sources/imported-notes-2.md');
    expect(secondPage).toContain('# Imported Notes');
    expect(secondPage).toContain(importedPath);
  });

  it('extracts text from docx files', async () => {
    const docxPath = path.join(tmpDir, 'briefing.docx');
    await fs.writeFile(docxPath, await buildDocxBuffer('Hello DOCX'), 'binary');

    const result = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'file',
      filePath: docxPath,
      fileName: 'briefing.docx',
    }, fm);

    expect(result.sourceSlug).toBe('hello-docx');

    const rawSource = await fm.readFile('knowledge-bases/test-base/raw/hello-docx/source.md');
    expect(rawSource).toContain('Hello DOCX');

    const metadata = await fm.readFile('knowledge-bases/test-base/raw/hello-docx/metadata.json');
    expect(metadata).toContain('"extractor": "mammoth"');
    expect(metadata).toContain('wordprocessingml.document');
  });

  it('extracts text from pdf files', async () => {
    const pdfPath = path.join(tmpDir, 'briefing.pdf');
    await fs.writeFile(pdfPath, buildPdfBuffer('Hello PDF'));

    const result = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'file',
      filePath: pdfPath,
      fileName: 'briefing.pdf',
    }, fm);

    expect(result.sourceSlug).toBe('hello-pdf');

    const rawSource = await fm.readFile('knowledge-bases/test-base/raw/hello-pdf/source.md');
    expect(rawSource).toContain('Hello PDF');

    const metadata = await fm.readFile('knowledge-bases/test-base/raw/hello-pdf/metadata.json');
    expect(metadata).toContain('"extractor": "pdf-parse"');
    expect(metadata).toContain('"mimeType": "application/pdf"');
  });

  it('extracts slide text from pptx files and records the warning', async () => {
    const pptxPath = path.join(tmpDir, 'deck.pptx');
    await fs.writeFile(pptxPath, await buildPptxBuffer('Hello PPTX'), 'binary');

    const result = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'file',
      filePath: pptxPath,
      fileName: 'deck.pptx',
    }, fm);

    expect(result.sourceSlug).toBe('slide-1');
    expect(result.warning).toContain('slide text only');

    const rawSource = await fm.readFile('knowledge-bases/test-base/raw/slide-1/source.md');
    expect(rawSource).toContain('## Slide 1');
    expect(rawSource).toContain('Hello PPTX');

    const metadata = await fm.readFile('knowledge-bases/test-base/raw/slide-1/metadata.json');
    expect(metadata).toContain('"extractor": "pptx-slide-text"');
    expect(metadata).toContain('presentationml.presentation');
  });

  it('reuses the same source slug for repeated X post ingests with the same status id', async () => {
    const first = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'x',
      xPostUrl: 'https://x.com/keel/status/1234567890',
      xText: 'First version of the post text',
      xAuthorHandle: '@keel',
      xAuthorName: 'Keel',
    }, fm);

    const second = await ingestWikiSource('knowledge-bases/test-base', {
      sourceType: 'x',
      xPostUrl: 'https://x.com/keel/status/1234567890',
      xText: 'Updated version of the post text',
      xAuthorHandle: '@keel',
      xAuthorName: 'Keel',
    }, fm);

    expect(first.sourceSlug).toBe('x-post-1234567890');
    expect(second.sourceSlug).toBe('x-post-1234567890');

    const rawSource = await fm.readFile('knowledge-bases/test-base/raw/x-post-1234567890/source.md');
    expect(rawSource).toContain('Updated version of the post text');
  });
});

async function buildDocxBuffer(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function buildPdfBuffer(text: string): Buffer {
  return Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
72 72 Td
(${text}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000335 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
405
%%EOF`);
}

async function buildPptxBuffer(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);
  zip.folder('ppt')?.file('presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`);
  zip.folder('ppt/_rels')?.file('presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);
  zip.folder('ppt/slides')?.file('slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
