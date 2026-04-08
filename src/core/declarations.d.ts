declare module 'mammoth' {
  interface ConversionResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface Options {
    path?: string;
    buffer?: Buffer;
  }
  function convertToHtml(options: Options): Promise<ConversionResult>;
  function extractRawText(options: Options): Promise<ConversionResult>;
  export default { convertToHtml, extractRawText };
}

declare module 'pdf-parse' {
  export class PDFParse {
    constructor(options: { data: Uint8Array });
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  }
}

declare module 'jszip' {
  interface ZipEntry {
    async(type: 'string' | 'text'): Promise<string>;
  }

  interface ZipArchive {
    files: Record<string, ZipEntry>;
    file(name: string): ZipEntry | null;
    file(name: string, content: string): ZipArchive;
    folder(name: string): ZipArchive;
    generateAsync(options: { type: 'nodebuffer' }): Promise<Buffer>;
  }

  interface JSZipConstructor {
    new (): ZipArchive;
    loadAsync(data: Buffer): Promise<ZipArchive>;
  }

  const JSZip: JSZipConstructor;
  export default JSZip;
}

declare module 'fast-xml-parser' {
  export class XMLParser {
    constructor(options?: Record<string, unknown>);
    parse(input: string): any;
  }
}
