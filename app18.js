// Home dashboard: show the three nearest dated trips with destination-aware imagery.
const HOME_TRIP_IMAGES = [
  {match:/베이징|북경|중국|만리장성|beijing|china/i,url:'https://images.unsplash.com/photo-1643732954035-5ad2a4eaa90d?auto=format&fit=crop&w=1200&q=82'},
  {match:/도쿄|오사카|교토|후쿠오카|삿포로|일본|tokyo|osaka|kyoto|japan/i,url:'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=82'},
  {match:/파리|프랑스|런던|로마|유럽|paris|france|london|rome|europe/i,url:'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=82'},
  {match:/제주|하와이|괌|발리|푸껫|몰디브|해변|바다|beach|island|bali|hawaii/i,url:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=82'},
  {match:/스위스|캐나다|알프스|산|자연|트레킹|swiss|canada|alps|mountain/i,url:'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=82'}
];
const HOME_DEFAULT_IMAGE='https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=82';

function homeTripImage(t){
  const key=`${t.destination||''} ${t.title||''}`;
  return (HOME_TRIP_IMAGES.find(x=>x.match.test(key))||{}).url||HOME_DEFAULT_IMAGE;
}
function homeDate(v){
  if(!v)return '날짜 미정';
  const [y,m,d]=v.split('-');
  return `${y}. ${Number(m)}. ${Number(d)}.`;
}
function homeDday(v){
  const now=new Date();now.setHours(0,0,0,0);
  const start=new Date(`${v}T00:00:00`);
  const n=Math.ceil((start-now)/86400000);
  return n===0?'D-DAY':n>0?`D-${n}`:'여행 중';
}
function renderUpcomingTrips(rows,loggedIn){
  const box=$('upcomingTripCards');if(!box)return;
  if(!loggedIn){box.innerHTML='<div class="upcoming-empty">로그인하면 다가오는 여행을 한눈에 볼 수 있습니다.</div>';return}
  if(!rows.length){box.innerHTML='<div class="upcoming-empty">날짜가 등록된 다가오는 여행이 없습니다.</div>';return}
  box.innerHTML=rows.map(t=>`<button class="upcoming-trip-card" type="button" onclick="openHomeTrip('${t.id}')" aria-label="${e(t.title||t.destination||'여행')} 열기"><img src="${homeTripImage(t)}" alt="" loading="lazy"><span class="trip-image-shade"></span><span class="dday-chip">${homeDday(t.start_date)}</span><span class="trip-card-copy"><small>${e(t.destination||'목적지 미정')}</small><strong>${e(t.title||'여행')}</strong><span>${homeDate(t.start_date)} ~ ${homeDate(t.end_date)} · ${Number(t.travelers_count)||1}명</span></span></button>`).join('');
}
window.openHomeTrip=id=>{go('trips');setTimeout(()=>openTrip(id),80)};

home=async function(){
  const u=await user();
  if(!u){$('hc').textContent='0';$('hn').textContent='-';renderUpcomingTrips([],false);return}
  const {data,error}=await sb.from('trips').select('*').order('start_date',{ascending:true});
  if(error){renderUpcomingTrips([],true);return}
  const now=new Date();now.setHours(0,0,0,0);
  const upcoming=(data||[]).filter(t=>t.start_date&&new Date(`${t.end_date||t.start_date}T23:59:59`)>=now).sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,3);
  $('hc').textContent=(data||[]).length;
  $('hn').textContent=upcoming[0]?.destination||'-';
  renderUpcomingTrips(upcoming,true);
};

// app14 initializes the page before this override is loaded, so refresh once with the final renderer.
home();
