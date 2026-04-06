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
