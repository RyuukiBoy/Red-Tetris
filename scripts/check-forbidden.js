import { readdir,readFile } from 'node:fs/promises';import path from 'node:path';
const root='client/src';const banned=[[/\bthis\b/,'this keyword'],[/<\s*(table|canvas|svg)\b/i,'forbidden element'],[/jquery|lucide|react-icons|fontawesome/i,'forbidden DOM/icon library']];
async function scan(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await scan(file);else if(/\.(js|jsx|css)$/.test(item.name)){const text=await readFile(file,'utf8');for(const [pattern,label] of banned)if(pattern.test(text))throw new Error(`${file}: banned ${label}`);}}}
await scan(root);console.log('Forbidden client patterns: none');
