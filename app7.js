function screenPdfBreakpoints(target,canvasHeight){
  const root=target.getBoundingClientRect(),ratio=canvasHeight/Math.max(1,target.scrollHeight);
  const selectors=['.item','.panel','.kpirow','.restaurants','.shopping','.routesummary','.routeleg','.memobox','.schedule-managebar','h2','h3'];
  const points=new Set([0,canvasHeight]);
  target.querySelectorAll(selectors.join(',')).forEach(el=>{
    const rect=el.getBoundingClientRect(),top=(rect.top-root.top+target.scrollTop)*ratio,bottom=(rect.bottom-root.top+target.scrollTop)*ratio;
    if(top>0&&top<canvasHeight)points.add(Math.round(top));
    if(bottom>0&&bottom<canvasHeight)points.add(Math.round(bottom));
  });
  return [...points].sort((a,b)=>a-b);
}
function screenPdfSlices(target,canvasHeight,idealHeight){
  const points=screenPdfBreakpoints(target,canvasHeight),slices=[];let start=0;
  while(start<canvasHeight){
    const ideal=Math.min(canvasHeight,start+idealHeight);if(ideal===canvasHeight){slices.push([start,canvasHeight-start]);break}
    // Prefer a shorter page over cutting a complete card in half.
    const minimum=start+idealHeight*.22;
    const safe=points.filter(value=>value>=minimum&&value<=ideal-8).pop();
    const end=safe&&safe>start?safe:ideal;
    slices.push([start,end-start]);start=end;
  }
  return slices;
}
async function exportScreenPdf(){
  const btn=$('screenPdfExport');
  const oldText=btn?.textContent;
  try{
    if(btn){btn.disabled=true;btn.textContent='PDF 생성 중...';}
    if(typeof html2canvas==='undefined')throw Error('html2canvas 모듈을 불러오지 못했습니다.');
    if(!window.jspdf?.jsPDF)throw Error('jsPDF 모듈을 불러오지 못했습니다.');

    const target=document.querySelector('.page.on')||document.body;
    const prevScrollX=window.scrollX,prevScrollY=window.scrollY;
    window.scrollTo(0,0);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

    const fullWidth=Math.max(target.scrollWidth,target.clientWidth,document.documentElement.clientWidth);
    const fullHeight=Math.max(target.scrollHeight,target.clientHeight,document.documentElement.clientHeight);

    const canvas=await html2canvas(target,{
      scale:Math.min(2,Math.max(1,window.devicePixelRatio||1.5)),
      useCORS:true,
      allowTaint:false,
      backgroundColor:'#f5f7fb',
      logging:false,
      scrollX:0,
      scrollY:0,
      width:fullWidth,
      height:fullHeight,
      windowWidth:fullWidth,
      windowHeight:fullHeight,
      onclone:(doc)=>{
        doc.querySelectorAll('.leaflet-control-container').forEach(x=>x.style.display='none');
        doc.querySelectorAll('img').forEach(img=>{img.crossOrigin='anonymous'});
        doc.querySelectorAll('*').forEach(el=>{
          const cs=doc.defaultView.getComputedStyle(el);
          if(cs.position==='fixed')el.style.position='absolute';
        });
      }
    });

    const {jsPDF}=window.jspdf;
    const orientation=canvas.width>=canvas.height?'landscape':'portrait';
    const pdf=new jsPDF({orientation,unit:'mm',format:'a4',compress:true});
    const pageW=pdf.internal.pageSize.getWidth();
    const pageH=pdf.internal.pageSize.getHeight();
    const margin=6;
    const usableW=pageW-margin*2;
    const usableH=pageH-margin*2;
    const imgW=usableW;
    const imgH=canvas.height*imgW/canvas.width;
    const imgData=canvas.toDataURL('image/jpeg',0.92);

    if(imgH<=usableH){
      pdf.addImage(imgData,'JPEG',margin,margin,imgW,imgH,undefined,'FAST');
    }else{
      const pxPerPage=Math.floor(canvas.width*(usableH/usableW));
      const slices=screenPdfSlices(target,canvas.height,pxPerPage);
      let page=0;
      for(const [y,sliceH] of slices){
        const slice=document.createElement('canvas');
        slice.width=canvas.width;
        slice.height=sliceH;
        const ctx=slice.getContext('2d');
        ctx.fillStyle='#f5f7fb';ctx.fillRect(0,0,slice.width,slice.height);
        ctx.drawImage(canvas,0,y,canvas.width,sliceH,0,0,canvas.width,sliceH);
        const sliceData=slice.toDataURL('image/jpeg',0.92);
        const sliceMmH=sliceH*imgW/canvas.width;
        if(page>0)pdf.addPage();
        pdf.addImage(sliceData,'JPEG',margin,margin,imgW,sliceMmH,undefined,'FAST');
        page++;
      }
    }
    pdf.save(`${trip?.title||'TRIPMATE'}_현재화면.pdf`);
    window.scrollTo(prevScrollX,prevScrollY);
  }catch(err){
    console.error('현재 화면 PDF 저장 오류',err);
    alert('현재 화면 PDF 저장 중 오류가 발생했습니다: '+(err?.message||err));
  }finally{
    if(btn){btn.disabled=false;btn.textContent=oldText||'현재 화면 그대로 PDF';}
  }
}
