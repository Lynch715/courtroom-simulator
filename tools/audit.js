const { chromium, devices } = require('playwright');
const path=require('path'), http=require('http'), fs=require('fs');
const mime={'.html':'text/html','.webp':'image/webp'};
const VIEWS = [
  {n:'phone', w:390, h:844, dsf:3, touch:true},
  {n:'pad',   w:834, h:1112, dsf:2, touch:true},
  {n:'pc',    w:1440, h:900, dsf:1, touch:false},
];
const dir = path.resolve('srv2');
const srv = http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'x.html':decodeURIComponent(q.url.split('?')[0].slice(1)));
  fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'}),r.end(d)));});

/* 量一遍：横向溢出、图片有没有被拉变形、按钮热区、字号、元素互相盖住 */
const PROBE = () => {
  const out = {overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, bad:[], small:[], squish:[], clipped:[]};
  document.querySelectorAll('*').forEach(el=>{
    const r = el.getBoundingClientRect();
    if(r.width===0) return;
    if(r.right > document.documentElement.clientWidth + 1.5)
      out.bad.push((el.id?'#'+el.id:el.className&&typeof el.className==='string'?'.'+el.className.split(' ')[0]:el.tagName) + ' right=' + Math.round(r.right));
  });
  document.querySelectorAll('img').forEach(im=>{
    const r = im.getBoundingClientRect();
    if(!im.naturalWidth || r.width===0) return;
    const na = im.naturalWidth/im.naturalHeight, ba = r.width/r.height;
    const fit = getComputedStyle(im).objectFit;
    if(fit==='fill' || (fit==='none'&&false)){ if(Math.abs(na-ba)/na > .04) out.squish.push((im.getAttribute('src')||'').split('/').pop()+' 变形 '+na.toFixed(2)+'→'+ba.toFixed(2)+' fit='+fit); }
  });
  document.querySelectorAll('button, .chip, a[role=button], textarea, input').forEach(b=>{
    const r=b.getBoundingClientRect(); if(r.width===0) return;
    if(r.height < 30) out.small.push((b.id?'#'+b.id:'.'+(b.className||'').split(' ')[0])+' h='+Math.round(r.height));
    const fs_ = parseFloat(getComputedStyle(b).fontSize);
    if(fs_ < 12) out.small.push((b.id?'#'+b.id:'.'+(b.className||'').split(' ')[0])+' font='+fs_);
  });
  /* 文字被容器裁掉 */
  document.querySelectorAll('.chip, button, .lab, .tag, h1,h2,h3, .brand span, .issue b, em').forEach(el=>{
    if(el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible')
      out.clipped.push((el.className||el.tagName)+' "'+el.textContent.trim().slice(0,14)+'" '+el.scrollWidth+'>'+el.clientWidth);
  });
  out.bad=[...new Set(out.bad)].slice(0,8); out.small=[...new Set(out.small)].slice(0,8);
  out.squish=[...new Set(out.squish)].slice(0,8); out.clipped=[...new Set(out.clipped)].slice(0,8);
  return out;
};

async function walk(p, tag, shots){
  const s = await p.evaluate(PROBE);
  const line = [];
  if(s.overflowX>1) line.push('横向溢出 '+s.overflowX+'px');
  if(s.bad.length) line.push('出界: '+s.bad.join(' | '));
  if(s.squish.length) line.push('图变形: '+s.squish.join(' | '));
  if(s.small.length) line.push('热区/字号: '+s.small.join(' | '));
  if(s.clipped.length) line.push('文字裁切: '+s.clipped.join(' | '));
  console.log('   ' + tag + (line.length? '  ⚠ '+line.join('；') : '  ok'));
  await p.screenshot({path:`shots/${shots}.png`, fullPage:false});
}

(async () => {
  fs.mkdirSync('shots',{recursive:true});
  await new Promise(r=>srv.listen(8100,r));
  const b = await chromium.launch();
  for(const v of VIEWS){
    console.log('\n===== ' + v.n + ' ' + v.w + '×' + v.h);
    const ctx = await b.newContext({viewport:{width:v.w,height:v.h}, deviceScaleFactor:v.dsf, isMobile:v.touch, hasTouch:v.touch});
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    p.on('console',m=>{if(m.type()==='error') errs.push('console:'+m.text());});
    await p.goto('http://localhost:8100/x.html');
    await p.waitForTimeout(400);
    await walk(p,'开场页', v.n+'-0intro');
    if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok'); await p.waitForTimeout(700);
    await walk(p,'事务所', v.n+'-1office');
    await p.evaluate(()=>takeCase('c04')); await p.waitForTimeout(900);
    await walk(p,'阅卷', v.n+'-2file');
    await p.click('.doc.pickable[data-ev="e1"]'); await p.waitForTimeout(300);
    await p.click('#aRead'); await p.waitForTimeout(400);
    await walk(p,'阅卷·细读', v.n+'-3read');
    await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(900);
    await walk(p,'会见', v.n+'-4meet');
    await p.fill('#talkSay','你先坐。不着急。'); await p.click('#go'); await p.waitForTimeout(900);
    await walk(p,'会见·对话', v.n+'-5talk');
    await p.click('#stop'); await p.waitForTimeout(600);
    await walk(p,'定策略', v.n+'-6strat');
    await p.click('#st .chip[data-v="innocent"]'); await p.click('#go'); await p.waitForTimeout(2200);
    await walk(p,'质证', v.n+'-7cross');
    await p.click('#tri .chip[data-v="relevance"]'); await p.click('#go'); await p.waitForTimeout(1000);
    await p.click('#tri .chip[data-v="none"]'); await p.click('#go'); await p.waitForTimeout(1000);
    await p.click('#tri .chip[data-v="none"]'); await p.click('#go'); await p.waitForTimeout(1200);
    await walk(p,'证人', v.n+'-8wit');
    if(await p.$('#wit .chip[data-v="ask"]')){ await p.click('#wit .chip[data-v="ask"]'); await p.waitForSelector('#witSay');
      await p.fill('#witSay','你出去了多久？'); await p.click('#go'); await p.waitForTimeout(1100); }
    await walk(p,'证人·发问', v.n+'-9ask');
    while(await p.$('#wit .chip')){ const c = await p.$('#wit .chip[data-v="pass"]'); if(!c) break; await c.click(); await p.click('#go'); await p.waitForTimeout(1200); break; }
    await p.waitForTimeout(600);
    await walk(p,'辩论', v.n+'-10debate');
    for(let i=0;i<8;i++){
      if(await p.$('.mask .vhead .r')) break;
      if(await p.$('#obj .chip')){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(500); continue; }
      if(await p.$('#say')){ await p.fill('#say','催收人员对被告人及其母亲的人身自由限制持续数小时，非法拘禁是持续性的不法侵害，民警到场后并未解除这一状态。'); await p.click('#go'); await p.waitForTimeout(1300); continue; }
      await p.waitForTimeout(500);
    }
    for(let i=0;i<14;i++){
      if(await p.$('.mask .vhead .r')) break;
      if(await p.$('#obj .chip')){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(450); continue; }
      if(await p.$('#say')){ await p.fill('#say','辩护人的辩论意见发表完毕。'); await p.click('#go'); await p.waitForTimeout(1000); continue; }
      await p.waitForTimeout(500);
    }
    await p.waitForSelector('.mask .vhead .r',{timeout:25000}).catch(()=>0);
    await p.waitForTimeout(500);
    await walk(p,'判决/复盘', v.n+'-11verdict');
    const modalScroll = await p.evaluate(()=>{const m=document.querySelector('.modal'); return m? {h:m.scrollHeight, vis:m.clientHeight, ok:m.scrollHeight<=window.innerHeight}:null;});
    console.log('   复盘弹窗 高' + (modalScroll&&modalScroll.h) + ' 视口内可滚：' + (modalScroll? '是':'-'));
    console.log('   页面 error: ' + errs.length + (errs.length? '  '+errs.slice(0,2).join(' | '):''));
    await ctx.close();
  }
  srv.close(); await b.close();
})();
