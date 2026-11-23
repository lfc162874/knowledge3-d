import { build } from 'esbuild';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
const license = await readFile('THREE-LICENSE.txt', 'utf8');
await mkdir('dist', {recursive:true});
const exists = async (p) => access(p).then(()=>true,()=>false);
for (const [name, script, style] of [['index','main','style'],['car','car','car']]) {
  // The car page is still being assembled; skip it until its sources exist.
  if (!await exists(`${name}.html`)) { console.warn(`skip ${name}: ${name}.html not found`); continue; }
  const result = await build({entryPoints:[`src/${script}.js`],bundle:true,minify:true,legalComments:'inline',format:'iife',write:false,target:'es2020'});
  const production = result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const css = await readFile(`src/${style}.css`,'utf8');
  const html = (await readFile(name+'.html','utf8'))
    .replace(/<link\b[^>]*href=["'](?:\.\/|\/)?src\/[\w-]+\.css["'][^>]*>/i,()=>'<style>'+css+'</style>')
    .replace(/<script\b[^>]*src=["'](?:\.\/|\/)?src\/[\w-]+\.js["'][^>]*>\s*<\/script>/i,()=>'<script>'+production+'</script>');
  if (!html.includes(production) || !html.includes(css)) throw new Error('Missing bundled entry in '+name);
  await writeFile('dist/'+name+'.html',html.replace('</html>','<!-- Three.js\n'+license+'\n-->\n</html>'));
}
