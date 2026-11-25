import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

export async function render(document: URL): Promise<string> {
  const ast = await openapiTS(document);
  return astToString(ast, { formatOptions: { removeComments: true } });
}

if (import.meta.main) {
  const [document, output] = process.argv.slice(2);
  if (document === undefined || output === undefined) {
    process.stderr.write(
      'Name the OpenAPI file and the file to write: node generate.ts <in> <out>\n'
    );
    process.exitCode = 2;
  } else {
    await writeFile(output, await render(pathToFileURL(document)));
  }
}
