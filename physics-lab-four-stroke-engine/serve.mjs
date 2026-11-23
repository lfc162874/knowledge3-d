import http from 'node:http';
import { readFile } from 'node:fs/promises';
const pages=new Map([['/','index.html'],['/index.html','index.html'],['/car.html','car.html']]);
const port=Number(process.env.PORT)||4173;
http.createServer(async (req,res)=>{
  const file=pages.get(req.url.split('?')[0]);
  if(!file){res.writeHead(404);res.end();return;}
  try {
    const html=await readFile(new URL('./dist/'+file,import.meta.url));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(html);
  } catch {res.writeHead(503);res.end('Run npm run build.');}
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
