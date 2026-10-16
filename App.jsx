import React, { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const kinds = [
  { id: 'photo1', label: 'Photo box 1', color: '#ef4444' },
  { id: 'photo2', label: 'Photo box 2', color: '#ef4444' },
  { id: 'signature', label: 'Signature box', color: '#eab308' },
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function renderPdfFirstPage(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, pdfBytes: bytes };
}
function findColorBoxes(canvas) {
  // Detects strong red/yellow demonstration boxes. Real uncolored forms need manual template setup.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const kinds = [
    { id: 'photo1', match: (r,g,b) => r > 145 && r > g * 1.45 && r > b * 1.25 && g < 135 },
    { id: 'signature', match: (r,g,b) => r > 175 && g > 135 && g < 235 && b < 105 && r > b * 1.7 && g > b * 1.5 },
  ];
  const output = {};
  for (const kind of kinds) {
    let minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        if (kind.match(data[i], data[i+1], data[i+2])) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++;
        }
      }
    }
    if (count > 20 && maxX > minX && maxY > minY) output[kind.id] = { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
  }
  // For demo forms with two red boxes, split the detected red region only when separated horizontally.
  const red = (() => {
    let minX=width,minY=height,maxX=-1,maxY=-1,count=0;
    for(let y=0;y<height;y+=2) for(let x=0;x<width;x+=2){
      const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
      if(r>145 && r>g*1.45 && r>b*1.25 && g<135){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}
    }
    return count>20 && maxX>minX && maxY>minY ? {x:minX,y:minY,w:maxX-minX,h:maxY-minY}:null;
  })();
  if (red) {
    // Detect separate red components using a coarse grid + flood fill.
    const step=3, gw=Math.ceil(width/step), gh=Math.ceil(height/step), mask=new Uint8Array(gw*gh);
    for(let gy=0;gy<gh;gy++) for(let gx=0;gx<gw;gx++){
      const i=(Math.min(height-1,gy*step)*width+Math.min(width-1,gx*step))*4;
      const r=data[i],g=data[i+1],b=data[i+2];
      mask[gy*gw+gx]=(r>145 && r>g*1.45 && r>b*1.25 && g<135)?1:0;
    }
    const seen=new Uint8Array(mask.length), comps=[];
    for(let start=0;start<mask.length;start++){
      if(!mask[start]||seen[start])continue;
      const q=[start];seen[start]=1;let minx=gw,miny=gh,maxx=0,maxy=0,n=0;
      while(q.length){const p=q.pop(),x=p%gw,y=Math.floor(p/gw);minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);n++;
        for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) if(nx>=0&&ny>=0&&nx<gw&&ny<gh){const np=ny*gw+nx;if(mask[np]&&!seen[np]){seen[np]=1;q.push(np);}}
      }
      if(n>5)comps.push({x:minx*step,y:miny*step,w:(maxx-minx+1)*step,h:(maxy-miny+1)*step,n});
    }
    const big=comps.filter(c=>c.w>12&&c.h>12).sort((a,b)=>b.n-a.n).slice(0,8).sort((a,b)=>a.x-b.x);
    if(big.length>=2){output.photo1=big[0];output.photo2=big[1];}
    else output.photo1=red;
  }
  return output;
}

export default function App() {
  const canvasRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const dragRef = useRef(null);
  const [form, setForm] = useState(null);
  const [formFile, setFormFile] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [signature, setSignature] = useState(null);
  const [boxes, setBoxes] = useState({});
  const [active, setActive] = useState('photo1');
  const [drag, setDrag] = useState(null);
  const [status, setStatus] = useState('Upload a form image or PDF to start.');
  const [removeWhite, setRemoveWhite] = useState(true);
  const [scale, setScale] = useState(0.92);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!form || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = form.width; canvas.height = form.height;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      drawPlaced(ctx, canvas.width, canvas.height);
      sourceCanvasRef.current = canvas;
    };
    img.src = form.dataUrl;
  }, [form, boxes, photo, signature, removeWhite, scale, drag]);

  function drawPlaced(ctx, width, height) {
    const items = [
      { id:'photo1', src:photo },
      { id:'photo2', src:photo },
      { id:'signature', src:signature },
    ];
    for (const item of items) {
      const b=boxes[item.id];
      if(!b || !item.src) continue;
      const img = new Image();
      img.onload = () => {
        const boxW=b.w, boxH=b.h;
        const factor = item.id === 'signature' ? Math.min(boxW*0.82/img.width, boxH*0.58/img.height, 1) : Math.min(boxW/img.width, boxH/img.height);
        const w=img.width*factor*(item.id==='signature'?scale:1), h=img.height*factor*(item.id==='signature'?scale:1);
        const x=b.x+(boxW-w)/2, y=b.y+(boxH-h)/2;
        ctx.save();
        if(item.id==='signature' && removeWhite) {
          const temp=document.createElement('canvas');temp.width=img.width;temp.height=img.height;
          const t=temp.getContext('2d',{willReadFrequently:true});t.drawImage(img,0,0);
          const imageData=t.getImageData(0,0,temp.width,temp.height);
          for(let i=0;i<imageData.data.length;i+=4){
            const r=imageData.data[i],g=imageData.data[i+1],bl=imageData.data[i+2];
            const brightness=(r+g+bl)/3;
            if(brightness>238) imageData.data[i+3]=0;
            else if(brightness>205) imageData.data[i+3]=Math.round((238-brightness)/33*255);
          }
          t.putImageData(imageData,0,0);
          ctx.drawImage(temp,x,y,w,h);
        } else ctx.drawImage(img,x,y,w,h);
        ctx.restore();
        // outlines show placement zones during editing
        ctx.save();ctx.strokeStyle=item.id==='signature'?'#eab308':'#ef4444';ctx.lineWidth=Math.max(2,width/700);ctx.setLineDash([8,5]);ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.restore();
      };
      img.src=item.src;
    }
    if (drag) {
      ctx.save();ctx.strokeStyle=kinds.find(k=>k.id===active)?.color||'#2563eb';ctx.lineWidth=3;ctx.setLineDash([8,5]);
      ctx.strokeRect(drag.x,drag.y,drag.w,drag.h);ctx.restore();
    }
  }

  async function handleForm(file) {
    if(!file)return;
    setBusy(true);setStatus('Loading form…');setFormFile(file);
    try {
      let result;
      if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')) result=await renderPdfFirstPage(file);
      else {
        const dataUrl=await fileToDataUrl(file), img=await loadImage(dataUrl);
        const max=2200, ratio=Math.min(1,max/Math.max(img.width,img.height));
        const c=document.createElement('canvas');c.width=Math.round(img.width*ratio);c.height=Math.round(img.height*ratio);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        result={dataUrl:c.toDataURL('image/png'),width:c.width,height:c.height};
      }
      setForm(result);
      const img=await loadImage(result.dataUrl), c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);
      const detected=findColorBoxes(c);
      setBoxes(detected);
      setStatus(Object.keys(detected).length ? 'Colored demo boxes detected where possible. Check every box before exporting.' : 'Form loaded. Select a box type and draw its rectangle on the form.');
    } catch(e) { console.error(e);setStatus('Could not open this file. Try a clear JPG, PNG, or PDF.'); }
    finally{setBusy(false);}
  }
  async function handleImage(file, type) {
    if(!file)return;
    try {
      const dataUrl=await fileToDataUrl(file), img=await loadImage(dataUrl);
      const max=1400, ratio=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement('canvas');c.width=Math.round(img.width*ratio);c.height=Math.round(img.height*ratio);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      if(type==='photo')setPhoto(c.toDataURL('image/png'));else setSignature(c.toDataURL('image/png'));
      setStatus(type==='photo'?'Portrait loaded. It will be placed in both photo boxes.':'Signature loaded. White-background removal is enabled by default.');
    } catch { setStatus('Could not load that image.'); }
  }
  function pointFromEvent(e) {
    const canvas=canvasRef.current, rect=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(form.width,(e.clientX-rect.left)*form.width/rect.width)),y:Math.max(0,Math.min(form.height,(e.clientY-rect.top)*form.height/rect.height))};
  }
  function onPointerDown(e) {
    if(!form)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p=pointFromEvent(e);dragRef.current=p;setDrag({...p,w:0,h:0});
  }
  function onPointerMove(e) {
    if(!dragRef.current)return;
    const p=pointFromEvent(e), s=dragRef.current;
    setDrag({x:Math.min(s.x,p.x),y:Math.min(s.y,p.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)});
  }
  function onPointerUp() {
    if(!dragRef.current||!drag)return;
    if(drag.w>8&&drag.h>8)setBoxes(prev=>({...prev,[active]:drag}));
    dragRef.current=null;setDrag(null);
  }
  function setBoxToDetected() {
    if(!form)return;
    const img=new Image();
    img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);const found=findColorBoxes(c);setBoxes(prev=>({...prev,...found}));setStatus(Object.keys(found).length?'Detected colored areas. Review and correct the boxes before export.':'No clear red/yellow boxes found. Draw each box manually using the tools below.');};
    img.src=form.dataUrl;
  }
  async function exportPng() {
    if(!form)return;
    const base=await loadImage(form.dataUrl), out=document.createElement('canvas');out.width=form.width;out.height=form.height;
    const ctx=out.getContext('2d');ctx.drawImage(base,0,0);
    for(const item of [{id:'photo1',src:photo},{id:'photo2',src:photo},{id:'signature',src:signature}]){
      const b=boxes[item.id];if(!b||!item.src)continue;
      const img=await loadImage(item.src);
      const f=item.id==='signature'?Math.min(b.w*0.82/img.width,b.h*0.58/img.height,1):Math.min(b.w/img.width,b.h/img.height);
      const w=img.width*f*(item.id==='signature'?scale:1),h=img.height*f*(item.id==='signature'?scale:1),x=b.x+(b.w-w)/2,y=b.y+(b.h-h)/2;
      if(item.id==='signature'&&removeWhite){
        const temp=document.createElement('canvas');temp.width=img.width;temp.height=img.height;const t=temp.getContext('2d',{willReadFrequently:true});t.drawImage(img,0,0);
        const d=t.getImageData(0,0,temp.width,temp.height);
        for(let i=0;i<d.data.length;i+=4){const v=(d.data[i]+d.data[i+1]+d.data[i+2])/3;if(v>238)d.data[i+3]=0;else if(v>205)d.data[i+3]=Math.round((238-v)/33*255);}
        t.putImageData(d,0,0);ctx.drawImage(temp,x,y,w,h);
      } else ctx.drawImage(img,x,y,w,h);
    }
    const a=document.createElement('a');a.href=out.toDataURL('image/png');a.download='formfit-completed.png';a.click();
    setStatus('PNG exported. For a PDF form, this starter exports the first page as an image; multi-page PDF editing is not implemented yet.');
  }
  async function exportPdf() {
    if(!form)return;
    setBusy(true);
    try{
      const base=await loadImage(form.dataUrl), out=document.createElement('canvas');out.width=form.width;out.height=form.height;
      const ctx=out.getContext('2d');ctx.drawImage(base,0,0);
      for(const item of [{id:'photo1',src:photo},{id:'photo2',src:photo},{id:'signature',src:signature}]){
        const b=boxes[item.id];if(!b||!item.src)continue;const img=await loadImage(item.src);
        const f=item.id==='signature'?Math.min(b.w*.82/img.width,b.h*.58/img.height,1):Math.min(b.w/img.width,b.h/img.height);
        const w=img.width*f*(item.id==='signature'?scale:1),h=img.height*f*(item.id==='signature'?scale:1),x=b.x+(b.w-w)/2,y=b.y+(b.h-h)/2;
        if(item.id==='signature'&&removeWhite){const tmp=document.createElement('canvas');tmp.width=img.width;tmp.height=img.height;const t=tmp.getContext('2d',{willReadFrequently:true});t.drawImage(img,0,0);const d=t.getImageData(0,0,tmp.width,tmp.height);for(let i=0;i<d.data.length;i+=4){const v=(d.data[i]+d.data[i+1]+d.data[i+2])/3;if(v>238)d.data[i+3]=0;else if(v>205)d.data[i+3]=Math.round((238-v)/33*255);}t.putImageData(d,0,0);ctx.drawImage(tmp,x,y,w,h);}else ctx.drawImage(img,x,y,w,h);
      }
      const pdf=await PDFDocument.create();const page=pdf.addPage([595.28,841.89]);const png=await pdf.embedPng(out.toDataURL('image/png'));
      const pageW=page.getWidth(),pageH=page.getHeight(),ratio=Math.min(pageW/form.width,pageH/form.height),w=form.width*ratio,h=form.height*ratio;
      page.drawImage(png,{x:(pageW-w)/2,y:(pageH-h)/2,width:w,height:h});
      const bytes=await pdf.save();const blob=new Blob([bytes],{type:'application/pdf'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='formfit-completed.pdf';a.click();URL.revokeObjectURL(url);
      setStatus('PDF exported. This starter places the completed first page into a PDF; it does not preserve the original PDF form fields or other pages.');
    }catch(e){console.error(e);setStatus('PDF export failed. Try exporting as PNG.');}
    finally{setBusy(false);}
  }

  const placedCount=['photo1','photo2','signature'].filter(k=>boxes[k]).length;
  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">F</div><div><h1>FormFit</h1><p>Smart photo & signature placement</p></div><span className="pill">Android-ready prototype</span></header>
    <section className="hero"><div><p className="eyebrow">FORM FILLING WORKSPACE</p><h2>Fit photos. Place signatures.<br/><em>Keep everything aligned.</em></h2><p className="hero-copy">Upload a form, choose your images, and mark the exact boxes. Red/yellow demo areas can be detected automatically; plain forms use a reusable manual template.</p></div><div className="hero-icon">▤<span>＋</span></div></section>
    <div className="layout">
      <aside className="panel controls">
        <div className="section-title"><span className="step">01</span><div><h3>Upload files</h3><p>Choose your form and source images</p></div></div>
        <label className="upload-card"><span className="upload-icon">▧</span><span><b>Form PDF or image</b><small>JPG, PNG, or PDF</small></span><input type="file" accept="image/*,application/pdf,.pdf" onChange={e=>handleForm(e.target.files?.[0])}/></label>
        <label className="upload-card"><span className="upload-icon">▣</span><span><b>Portrait photo</b><small>Used in both red boxes</small></span><input type="file" accept="image/*" onChange={e=>handleImage(e.target.files?.[0],'photo')}/></label>
        <label className="upload-card"><span className="upload-icon">✍</span><span><b>Signature image</b><small>White background can be removed</small></span><input type="file" accept="image/*" onChange={e=>handleImage(e.target.files?.[0],'signature')}/></label>
        <div className="divider"/>
        <div className="section-title"><span className="step">02</span><div><h3>Mark the boxes</h3><p>Select a box, then drag on the form preview</p></div></div>
        <div className="box-options">{kinds.map(k=><button key={k.id} className={`box-option ${active===k.id?'selected':''}`} onClick={()=>setActive(k.id)}><i style={{background:k.color}}/>{k.label}<span>{boxes[k.id]?'✓':'＋'}</span></button>)}</div>
        <button className="secondary-btn" onClick={setBoxToDetected} disabled={!form}>⌕ Detect red/yellow demo boxes</button>
        <div className="setting">
          <label className="toggle-row"><span><b>Remove white from signature</b><small>Best for dark ink on white paper</small></span><input type="checkbox" checked={removeWhite} onChange={e=>setRemoveWhite(e.target.checked)}/></label>
        </div>
        <div className="setting"><label className="range-label"><span><b>Signature size</b><strong>{Math.round(scale*100)}%</strong></span><input type="range" min="0.55" max="1" step="0.01" value={scale} onChange={e=>setScale(Number(e.target.value))}/><small>Signature stays smaller than the yellow box by default.</small></label></div>
        <div className="divider"/>
        <div className="section-title"><span className="step">03</span><div><h3>Export completed form</h3><p>Check placements before saving</p></div></div>
        <div className="export-actions"><button className="primary-btn" disabled={!form||busy} onClick={exportPdf}>{busy?'Working…':'↓ Export PDF'}</button><button className="secondary-btn" disabled={!form||busy} onClick={exportPng}>Export PNG</button></div>
        <p className="privacy-note">Files are processed in your browser in this prototype. They are not uploaded to a server.</p>
      </aside>
      <section className="panel preview-panel">
        <div className="preview-head"><div><h3>Live form preview</h3><p>Choose a box tool and draw over its location</p></div><span className="counter">{placedCount}/3 BOXES MARKED</span></div>
        <div className="canvas-wrap">
          {form?<canvas ref={canvasRef} className="form-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />:<div className="empty-state"><div className="paper-icon">▤</div><h3>Your form preview appears here</h3><p>Upload a form PDF or photo to begin. Use a demo form with red and yellow guides to test automatic detection.</p><label className="primary-btn file-cta">Choose form<input type="file" accept="image/*,application/pdf,.pdf" onChange={e=>handleForm(e.target.files?.[0])}/></label></div>}
        </div>
        <div className="legend"><span><i className="red-dot"/>Photo boxes</span><span><i className="yellow-dot"/>Signature box</span><span className="legend-hint">Drag to draw or correct a box</span></div>
        <div className="status"><span className="status-dot"/>{status}</div>
        <div className="preview-foot"><span>Portrait: {photo?'ready':'not added'}</span><span>Signature: {signature?'ready':'not added'}</span><button onClick={()=>{setBoxes({});setStatus('Boxes cleared. Select a tool and draw each box again.')}} disabled={!form}>Clear boxes</button></div>
      </section>
    </div>
    <footer><span>FormFit · Starter project</span><span>Always review the final form before submitting it.</span></footer>
  </main>;
}