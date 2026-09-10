// v50: build travel-plan PDFs as complete day pages with a repeated day route map.
(function(){
  function pdfDayChunks(items,size=6){
    const result=[];
    for(let index=0;index<items.length;index+=size)result.push(items.slice(index,index+size));
    return result.length?result:[[]];
  }
  function pdfSummary(dist,places){
    return `<div style="font-size:15px;font-weight:800;color:#123a72;margin-bottom:10px">여행 요약</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px"><div style="background:#f2f7ff;border-radius:14px;padding:12px;text-align:center"><div style="font-size:9px;color:#64748b">여행기간</div><b style="font-size:14px">${trip.days||'-'}일</b></div><div style="background:#f2f7ff;border-radius:14px;padding:12px;text-align:center"><div style="font-size:9px;color:#64748b">여행인원</div><b style="font-size:14px">${trip.travelers_count||1}명</b></div><div style="background:#f2f7ff;border-radius:14px;padding:12px;text-align:center"><div style="font-size:9px;color:#64748b">총 이동거리</div><b style="font-size:14px">${dist?dist.toFixed(1)+'km':'-'}</b></div><div style="background:#f2f7ff;border-radius:14px;padding:12px;text-align:center"><div style="font-size:9px;color:#64748b">주요 장소</div><b style="font-size:14px">${places}곳</b></div></div>`;
  }
  function pdfHero(){
    return `<div style="padding:22px 26px 18px;background:linear-gradient(90deg,rgba(8,34,71,.82),rgba(8,34,71,.25)),url('https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1600&q=85') center/cover;color:#fff;min-height:120px;border-bottom:4px solid #2f6fd6"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:.5px">TRIP:MATE</div><div style="font-size:10px;color:#eaf4ff">Your Travel, Our Mate</div></div><div style="text-align:right"><div style="font-size:21px;font-weight:900;color:#fff">${e(trip.title)}</div><div style="font-size:11px;color:#eef6ff">${e(trip.destination)} · ${e(trip.start_date||'')} - ${e(trip.end_date||'')}</div></div></div></div>`;
  }
  function pdfDayHeader(day,part,totalParts){
    return `<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px;border-bottom:2px solid #dbe8f7;padding-bottom:9px"><div><span style="font-size:10px;font-weight:800;color:#2f6fd6">DAILY ROUTE</span><div style="font-size:23px;font-weight:900;color:#123a72">Day ${day}${totalParts>1?` · ${part}/${totalParts}`:''}</div></div><div style="font-size:12px;color:#64748b">${pdfDate(day)}</div></div>`;
  }
  function pdfTips(){
    return `<div class="pdf-keep" style="margin-top:14px;border:1px solid #dfe9f6;border-radius:16px;padding:12px;background:#fbfdff;break-inside:avoid;page-break-inside:avoid"><b style="font-size:12px;color:#123a72">TRIP:MATE 여행 TIP</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px;font-size:10px;color:#526174"><div>✓ 일정 사이 이동시간은 실제 교통상황에 따라 달라질 수 있어요.</div><div>✓ 예약번호와 항공편은 출발 전 한 번 더 확인하세요.</div><div>✓ 메모 버튼에 현장 팁과 변경사항을 바로 기록해보세요.</div><div>✓ 지도 번호는 해당 날짜의 일정 순서입니다.</div></div></div>`;
  }
  function pdfFooter(){return '<div style="margin-top:14px;padding:10px 0;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between"><span>TRIP:MATE</span><span>Travel Smarter, Live Better</span></div>'}

  window.exportTripPdf=async function(includeActual){
    const button=$('pdfExport'),oldText=button?.textContent;
    try{
      if(button){button.disabled=true;button.textContent='PDF 생성 중...'}
      const report=await collectTripReport();await ensurePdfCoords(report.its);
      const distance=report.its.reduce((sum,item)=>sum+Number(item.travel_distance_km||0),0);
      const places=new Set(report.its.map(item=>item.place).filter(Boolean)).size;
      const groups={};report.its.forEach(item=>(groups[item.day_no]??=[]).push(item));
      const days=Object.keys(groups).sort((a,b)=>Number(a)-Number(b));
      const pages=[];
      days.forEach((day,dayIndex)=>{
        const all=groups[day],chunks=pdfDayChunks(all);
        chunks.forEach((chunk,chunkIndex)=>{
          const first=dayIndex===0&&chunkIndex===0,last=dayIndex===days.length-1&&chunkIndex===chunks.length-1;
          pages.push(`<section class="pdf-export-page" style="width:794px;min-height:1120px;box-sizing:border-box;background:#fff;break-after:${last?'auto':'page'};page-break-after:${last?'auto':'always'};overflow:hidden">${first?pdfHero():''}<div style="padding:${first?'16':'24'}px 24px 18px">${first?pdfSummary(distance,places):''}${pdfDayHeader(day,chunkIndex+1,chunks.length)}<div style="display:grid;grid-template-columns:1.12fr .88fr;gap:14px;align-items:start"><div class="pdf-keep" style="break-inside:avoid;page-break-inside:avoid"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b style="font-size:15px;color:#123a72">지도 & 동선</b><span style="font-size:9px;color:#64748b">Day ${day} 일정 순서</span></div><div style="height:390px;border:1px solid #dfe9f6;border-radius:18px;overflow:hidden">${routeSvg(all.filter(x=>x.item_type!=='flight'))}</div></div><div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b style="font-size:15px;color:#123a72">일정 타임라인</b><span style="font-size:9px;color:#64748b">${chunks.length>1?'계속':''}</span></div>${timelineHtml(chunk)}</div></div>${last?pdfTips():''}${pdfFooter()}</div></section>`);
        });
      });
      if(!pages.length)pages.push(`<section class="pdf-export-page" style="width:794px;min-height:1120px;background:#fff;page-break-after:always">${pdfHero()}<div style="padding:24px">${pdfSummary(distance,places)}<div style="padding:80px;text-align:center;color:#64748b">등록된 일정이 없습니다.</div>${pdfFooter()}</div></section>`);
      const host=document.createElement('div');host.style='font-family:Arial,"Noto Sans KR",sans-serif;color:#172b4d;background:#fff;width:794px;padding:0;margin:0';host.innerHTML=pages.join('')+(includeActual?spendingHtml(report):'');
      await html2pdf().set({margin:0,filename:`${trip.title}_${includeActual?'여행이력':'여행계획'}_대시보드.pdf`,html2canvas:{scale:2,useCORS:true,backgroundColor:'#fff',logging:false},pagebreak:{mode:['css','legacy'],before:['.pdf-export-page:not(:first-child)'],avoid:['.pdf-day-card','.pdf-keep']},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(host).save();
    }catch(error){console.error('여행계획 PDF 저장 오류',error);alert('여행계획 PDF 저장 중 오류가 발생했습니다: '+(error?.message||error))}
    finally{if(button){button.disabled=false;button.textContent=oldText||'여행계획 PDF'}}
  };
})();
