import { spawn } from 'node:child_process';
const args=['--env-file-if-exists=.env'];
const children=[spawn(process.execPath,[...args,'server/src/index.js'],{stdio:'inherit'}),spawn(process.execPath,[...args,'node_modules/vite/bin/vite.js','--host','0.0.0.0'],{stdio:'inherit'})];
let stopping=false;const stop=code=>{if(stopping)return;stopping=true;for(const child of children)child.kill();process.exit(code);};
for(const child of children)child.on('exit',code=>{if(!stopping)stop(code??1);});process.on('SIGINT',()=>stop(0));process.on('SIGTERM',()=>stop(0));
