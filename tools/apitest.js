const { chromium } = require('playwright');
const path=require('path'), http=require('http'), fs=require('fs');
const mime={'.html':'text/html','.webp':'image/webp'};
const dir=path.resolve('srv2');

/* 假的 OpenAI 兼容端点，按路径演各种坏情况 */
const fake = http.createServer((q,r)=>{
  const mode = q.url.split('/')[1];
  const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(q.method==='OPTIONS'){ r.writeHead(204,CORS); return r.end(); }
  const send=(code,obj)=>{ r.writeHead(code,Object.assign({'Content-Type':'application/json'},CORS)); r.end(JSON.stringify(obj)); };
  let body=''; q.on('data',d=>body+=d); q.on('end',()=>{
    const req = (()=>{try{return JSON.parse(body)}catch(e){return {}}})();
    switch(mode){
      case 'ok':    return send(200,{model:'fake-v4-flash',choices:[{message:{content:'{"ok":1}'}}]});
      case 'nojson':
        if(req.response_format) return send(400,{error:{message:"response_format is not supported by this model"}});
        return send(200,{model:'fake-old',choices:[{message:{content:'好的，{"ok":1}'}}]});
      case 'chatty': return send(200,{model:'fake-chatty',choices:[{message:{content:'当然可以！这是您要的结果。'}}]});
      case 'k401':  return send(401,{error:{message:"Authentication Fails, Your api key is invalid"}});
      case 'k402':  return send(402,{error:{message:"Insufficient Balance"}});
      case 'k429':  return send(429,{error:{message:"Rate limit reached"}});
      case 'k404':  return send(404,{error:{message:"Not Found"}});
      case 'k500':  return send(500,{error:{message:"Internal Server Error"}});
      case 'badmodel': return send(400,{error:{message:"Model Not Exist: model `xxx` not found"}});
      case 'hang':  return; /* 不回，测超时——但 20s 太久，这条单独测 */
      default:      return send(404,{error:{message:"Not Found"}});
    }
  });
});

const srv=http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'x.html':decodeURIComponent(q.url.split('?')[0].slice(1)));
 fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'}),r.end(d)));});

const CASES = [
  ['通了',           'http://localhost:8199/ok',       'fake-v4-flash', 'sk-x'],
  ['不支持 JSON 模式','http://localhost:8199/nojson',  'fake-old',      'sk-x'],
  ['不肯只回 JSON',   'http://localhost:8199/chatty',  'fake-chatty',   'sk-x'],
  ['密钥不对',        'http://localhost:8199/k401',    'm',             'sk-bad'],
  ['余额不足',        'http://localhost:8199/k402',    'm',             'sk-x'],
  ['限流',           'http://localhost:8199/k429',    'm',             'sk-x'],
  ['404',            'http://localhost:8199/k404',    'm',             'sk-x'],
  ['对方 500',        'http://localhost:8199/k500',    'm',             'sk-x'],
  ['模型名不对',      'http://localhost:8199/badmodel','xxx',           'sk-x'],
  ['连不上',          'http://localhost:9/nope',       'm',             'sk-x'],
  ['地址不是网址',    'api.deepseek.com',              'm',             'sk-x'],
  ['没填 key',        'http://localhost:8199/ok',      'm',             ''],
];

(async()=>{
  await new Promise(r=>fake.listen(8199,r));
  await new Promise(r=>srv.listen(8120,r));
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:900,height:900}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8120/x.html'); await p.waitForTimeout(400);
  if(await p.$('#wgo')) await p.click('#wgo'); await p.waitForTimeout(600);
  for(const [name, base, model, key] of CASES){
    await p.evaluate(()=>{ document.querySelectorAll('.mask').forEach(m=>m.remove()); openCfg(false); });
    await p.waitForSelector('#test');
    await p.fill('#base', base); await p.fill('#model', model); await p.fill('#key', key);
    await p.click('#test');
    await p.waitForFunction(()=>{const t=document.querySelector('#testOut'); return t && !t.classList.contains('wait');},{timeout:25000}).catch(()=>0);
    const out = await p.evaluate(()=>{const t=document.querySelector('#testOut');
      return {cls:t.className.replace('testOut ',''), title:(t.querySelector('b')||{}).textContent||'', d:((t.querySelector('span')||{}).textContent||'').split('\n')[0]};});
    console.log(`${name.padEnd(16,'　')} [${out.cls.padEnd(4)}] ${out.title}`);
    if(out.d) console.log(`                   ${out.d.slice(0,72)}`);
  }
  console.log('\n页面 error：' + errs.length + (errs.length? '  '+errs.slice(0,2).join(' | '):''));
  fake.close(); srv.close(); await b.close();
})();
