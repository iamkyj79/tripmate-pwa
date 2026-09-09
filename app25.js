// v48: insert manual itinerary items anywhere and keep every itinerary feature available.
(function(){
  const originalRenderIt=window.renderIt;
  const originalShowI=window.showI;

  function dayRows(day,excludeId){
    return (window._i||[]).filter(x=>Number(x.day_no)===Number(day)&&x.id!==excludeId);
  }
  function positionLabel(index,total){
    if(index===0)return '첫 번째 일정으로';
    if(index===total)return '마지막 일정으로';
    return `${index}번 일정 다음에`;
  }
  function fillPositionSelect(item){
    const select=$('iinsert');if(!select)return;
    const rows=dayRows($('iday').value,item?.id);
    let selected=item?.id?(window._i||[]).filter(x=>Number(x.day_no)===Number($('iday').value)).findIndex(x=>x.id===item.id):rows.length;
    if(selected<0)selected=rows.length;
    selected=Math.max(0,Math.min(rows.length,selected));
    select.innerHTML=Array.from({length:rows.length+1},(_,index)=>`<option value="${index}" ${index===selected?'selected':''}>${e(positionLabel(index,rows.length))}</option>`).join('');
  }
  async function normalizeDay(day,movedId,position){
    const {data,error}=await sb.from('itinerary_items').select('id,sort_order').eq('trip_id',trip.id).eq('day_no',day).order('sort_order');
    if(error)throw error;
    const ordered=(data||[]).filter(x=>x.id!==movedId);
    const moved=(data||[]).find(x=>x.id===movedId);if(!moved)return;
    ordered.splice(Math.max(0,Math.min(ordered.length,Number(position))),0,moved);
    for(let index=0;index<ordered.length;index+=1){
      const {error:updateError}=await sb.from('itinerary_items').update({sort_order:index}).eq('id',ordered[index].id);
      if(updateError)throw updateError;
    }
  }
  window.moveSchedule=async function(id,direction){
    const item=(window._i||[]).find(x=>x.id===id);if(!item)return;
    const rows=dayRows(item.day_no);const current=rows.findIndex(x=>x.id===id);
    const next=current+Number(direction);if(current<0||next<0||next>=rows.length)return;
    try{await normalizeDay(item.day_no,id,next);await renderIt()}catch(error){alert('일정 순서를 변경하지 못했습니다: '+error.message)}
  };

  window.renderIt=async function(){
    await originalRenderIt();
    const host=$('tabbody');if(!host)return;
    const toolbar=document.createElement('div');toolbar.className='schedule-managebar';
    toolbar.innerHTML='<div><b>여행 일정</b><span class="muted"> 원하는 위치에 일정을 추가하고 ↑↓로 순서를 조정하세요.</span></div><button class="btn" id="addSchedule" type="button">+ 일정 추가</button>';
    host.insertBefore(toolbar,host.firstChild);
    $('addSchedule').onclick=()=>showI({day_no:1});
    const cards=[...host.querySelectorAll(':scope > .item')];
    cards.forEach((card,index)=>{
      const item=(window._i||[])[index],actions=card.querySelector('.actions');if(!item||!actions)return;
      const same=dayRows(item.day_no),position=same.findIndex(x=>x.id===item.id);
      const controls=document.createElement('span');controls.className='schedule-order-controls';
      controls.innerHTML=`<button class="small" type="button" title="앞 일정으로 이동" aria-label="${e(item.title)} 앞 일정으로 이동" ${position<=0?'disabled':''} onclick="moveSchedule('${item.id}',-1)">↑</button><button class="small" type="button" title="뒤 일정으로 이동" aria-label="${e(item.title)} 뒤 일정으로 이동" ${position<0||position>=same.length-1?'disabled':''} onclick="moveSchedule('${item.id}',1)">↓</button>`;
      actions.prepend(controls);
    });
  };

  window.showI=function(item={}){
    window._rests=cleanRestaurants(item.restaurant_suggestions);
    window._shops=cleanShopping(item.shopping_suggestions);
    originalShowI(item);
    const grid=$('scheduleModalBody')?.querySelector('.grid');if(!grid)return;
    const field=document.createElement('div');field.className='field';
    field.innerHTML='<label>일정 삽입 위치</label><select id="iinsert"></select><small class="muted">저장 후에도 ↑↓ 버튼으로 변경할 수 있습니다.</small>';
    grid.insertBefore(field,grid.children[2]||null);
    fillPositionSelect(item);
    $('iday').addEventListener('change',()=>fillPositionSelect({...item,id:item.id||null}));
  };

  window.enrich=async function(silent){
    const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');
    const current={title:$('ititle').value.trim(),place:$('iplace').value.trim(),item_type:$('itype').value,transport:$('itrans').value.trim(),notes:$('inotes').value.trim(),airline:$('iair')?.value||'',flight_number:$('ifn')?.value||'',departure_airport:$('ida')?.value||'',arrival_airport:$('iaa')?.value||'',departure_terminal:$('idt')?.value||'',arrival_terminal:$('iat')?.value||'',seat:$('iseat')?.value||'',booking_reference:$('ibref')?.value||''};
    if(!current.title)throw Error('일정명을 입력하세요.');
    const day=Number($('iday').value),position=Number($('iinsert')?.value??dayRows(day).length),id=$('iid').value;
    const rows=dayRows(day,id),previous=position>0?rows[Math.min(position-1,rows.length-1)]:null;
    if(!silent)M('imsg','이동정보·비용·맛집·쇼핑 정보를 자동으로 채우는 중입니다...');
    const response=await fetch(ENR,{method:'POST',headers:{'Content-Type':'application/json',apikey:K,Authorization:'Bearer '+session.access_token},body:JSON.stringify({destination:trip.destination,start_date:trip.start_date,end_date:trip.end_date,previous,current:{...current,notes:[current.notes,'이전 일정부터 이동수단·거리·소요시간·교통비를 채우고 주변 실명 맛집을 최소 3곳 추천하며, 적절한 쇼핑 장소가 있으면 2~3곳과 이동수단·거리·소요시간을 포함할 것'].filter(Boolean).join(' · ')}})});
    const result=await response.json();if(!response.ok)throw Error(result.error||result.detail||'자동 보완에 실패했습니다.');
    const value=result.enrichment||{};
    $('itype').value=value.item_type||$('itype').value;$('itrans').value=value.transport||$('itrans').value;
    $('idur').value=value.travel_duration_min??$('idur').value;$('idist').value=value.travel_distance_km??$('idist').value;
    $('ifare').value=value.travel_cost??$('ifare').value;$('icost').value=value.estimated_cost??$('icost').value;
    $('icur').value=value.currency||$('icur').value;$('imeal').value=value.meal_type||$('imeal').value;
    window._rests=cleanRestaurants(value.restaurant_suggestions);
    window._shops=cleanShopping(value.shopping_suggestions);
    if(typeof fallbackRestaurants==='function'&&window._rests.length<3){const names=new Set(window._rests.map(x=>x.name));for(const x of fallbackRestaurants(current))if(!names.has(x.name)){window._rests.push(x);names.add(x.name)}window._rests=window._rests.slice(0,3)}
    if(typeof shoppingCandidate==='function'&&shoppingCandidate(current)&&typeof fallbackShopping==='function'&&window._shops.length<2){const names=new Set(window._shops.map(x=>x.name));for(const x of fallbackShopping(current))if(!names.has(x.name)){window._shops.push(x);names.add(x.name)}window._shops=window._shops.slice(0,3)}
    if(value.notes_append)$('inotes').value=[$('inotes').value,value.notes_append].filter(Boolean).join(' · ');
    if(!silent)M('imsg','자동 보완이 완료되었습니다. 저장하면 추천 체크리스트와 지도에도 반영됩니다.','ok');
  };

  window.saveI=async function(){
    try{
      const user=await need();if(!$('ititle').value.trim())throw Error('일정명을 입력하세요.');
      if($('itype').value!=='flight'&&(!$('idur').value||$('icost').value==='')){try{await enrich(true)}catch(error){console.warn('[tripmate] manual enrichment failed',error)}}
      const numberOrNull=id=>$(id).value===''?null:Number($(id).value),day=Number($('iday').value),position=Number($('iinsert')?.value??dayRows(day).length);
      const payload={day_no:day,start_time:$('itime').value||null,item_type:$('itype').value,title:$('ititle').value.trim(),place:$('iplace').value.trim()||null,transport:$('itrans').value.trim()||null,travel_duration_min:numberOrNull('idur'),travel_distance_km:numberOrNull('idist'),travel_cost:numberOrNull('ifare'),estimated_cost:numberOrNull('icost'),currency:$('icur').value.trim()||null,meal_type:$('imeal').value||null,restaurant_suggestions:window._rests||[],shopping_suggestions:window._shops||[],airline:$('iair')?.value||null,flight_number:$('ifn')?.value||null,departure_airport:$('ida')?.value||null,arrival_airport:$('iaa')?.value||null,departure_terminal:$('idt')?.value||null,arrival_terminal:$('iat')?.value||null,seat:$('iseat')?.value||null,booking_reference:$('ibref')?.value||null,departure_at:$('idat')?.value?new Date($('idat').value).toISOString():null,arrival_at:$('iaat')?.value?new Date($('iaat').value).toISOString():null,notes:$('inotes').value.trim()||null};
      let id=$('iid').value,oldDay=null;
      if(id){const {data:old,error:readError}=await sb.from('itinerary_items').select('*').eq('id',id).single();if(readError)throw readError;oldDay=old.day_no;const {error}=await sb.from('itinerary_items').update({...payload,latitude:old.place===payload.place?old.latitude:null,longitude:old.place===payload.place?old.longitude:null,geocoded_at:old.place===payload.place?old.geocoded_at:null}).eq('id',id);if(error)throw error;await cascadeAfterEdit(old,{...old,...payload})}
      else{const {data:created,error}=await sb.from('itinerary_items').insert({...payload,user_id:user.id,trip_id:trip.id,sort_order:9999}).select().single();if(error)throw error;id=created.id}
      await normalizeDay(day,id,position);
      if(oldDay!=null&&Number(oldDay)!==day){const {data:left}=await sb.from('itinerary_items').select('id').eq('trip_id',trip.id).eq('day_no',oldDay).order('sort_order');for(let index=0;index<(left||[]).length;index+=1)await sb.from('itinerary_items').update({sort_order:index}).eq('id',left[index].id)}
      window._rests=[];window._shops=[];closeScheduleModal();await renderIt();
    }catch(error){M('imsg',error.message,'error')}
  };
})();
