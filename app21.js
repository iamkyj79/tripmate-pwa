// v39: destination-bounded geocoding and a PDF route preview that never renders blank.
let tripDestinationContextPromise = null;
let tripDestinationContextKey = '';
let lastGeocodeRequestAt = 0;

function geoDistanceKm(a, b) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

async function limitedNominatim(query, context, bounded = true) {
  const wait = Math.max(0, 1050 - (Date.now() - lastGeocodeRequestAt));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastGeocodeRequestAt = Date.now();
  let url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=' + encodeURIComponent(query);
  if (context && bounded) {
    const [lat, lon] = context;
    url += `&viewbox=${lon - 4},${lat + 4},${lon + 4},${lat - 4}&bounded=1`;
  }
  const response = await fetch(url, { headers: { 'Accept-Language': 'ko,en' } });
  if (!response.ok) return [];
  return response.json();
}

async function tripDestinationContext() {
  const key = `${trip?.destination || ''}|${trip?.country || ''}`;
  if (key !== tripDestinationContextKey) { tripDestinationContextKey = key; tripDestinationContextPromise = null; }
  if (tripDestinationContextPromise) return tripDestinationContextPromise;
  tripDestinationContextPromise = (async () => {
    const known = /베이징|북경|beijing/i.test(trip?.destination || '') ? [39.9042, 116.4074] : null;
    if (known) return known;
    try {
      const rows = await limitedNominatim([trip?.destination, trip?.country].filter(Boolean).join(', '), null, false);
      return rows?.[0] ? [Number(rows[0].lat), Number(rows[0].lon)] : null;
    } catch (_) { return null; }
  })();
  return tripDestinationContextPromise;
}

function knownDestinationPoint(item) {
  if (!/베이징|북경|beijing/i.test(trip?.destination || '')) return null;
  const key = `${item.title || ''} ${item.place || ''}`;
  const points = [
    [/서우두|capital airport|pek/i,[40.0799,116.6031]],
    [/다싱|daxing|pkx/i,[39.5098,116.4105]],
    [/천안문|톈안먼|tiananmen/i,[39.9055,116.3976]],
    [/자금성|고궁|forbidden city|palace museum/i,[39.9163,116.3972]],
    [/왕푸징|wangfujing/i,[39.9146,116.4126]],
    [/천단|temple of heaven/i,[39.8822,116.4066]],
    [/유니버설|universal/i,[39.8530,116.6740]],
    [/이화원|summer palace/i,[39.9999,116.2755]],
    [/무톈위|모전욕|mutianyu/i,[40.4319,116.5704]],
    [/난뤄구샹|남라고상|nanluoguxiang/i,[39.9370,116.4030]],
    [/첸먼|전문|qianmen/i,[39.8996,116.3976]],
    [/그랜드 머큐어|grand mercure/i,[39.8994,116.3742]],
  ];
  return points.find(([pattern]) => pattern.test(key))?.[1] || null;
}

function destinationAliases(item) {
  const key = `${item.title || ''} ${item.place || ''}`;
  const aliases = [
    [/서우두|capital airport|pek/i,'北京首都国际机场, Beijing Capital International Airport'],
    [/천안문|톈안먼|tiananmen/i,'天安门广场, Tiananmen Square'],
    [/자금성|고궁|forbidden city|palace museum/i,'故宫博物院, Forbidden City Beijing'],
    [/왕푸징|wangfujing/i,'王府井步行街, Wangfujing Beijing'],
    [/천단|temple of heaven/i,'天坛公园, Temple of Heaven Beijing'],
    [/유니버설|universal/i,'北京环球度假区, Universal Beijing Resort'],
    [/이화원|summer palace/i,'颐和园, Summer Palace Beijing'],
    [/무톈위|모전욕|mutianyu/i,'慕田峪长城, Mutianyu Great Wall'],
    [/난뤄구샹|남라고상|nanluoguxiang/i,'南锣鼓巷, Nanluoguxiang Beijing'],
    [/첸먼|전문|qianmen/i,'前门大街, Qianmen Street Beijing'],
    [/그랜드 머큐어|grand mercure/i,'北京西单美爵酒店, Grand Mercure Beijing Central'],
  ];
  return aliases.find(([pattern]) => pattern.test(key))?.[1] || null;
}

geocodeItem = async function(item) {
  const context = await tripDestinationContext();
  const stored = item.latitude != null && item.longitude != null ? [Number(item.latitude), Number(item.longitude)] : null;
  if (stored && (!context || geoDistanceKm(context, stored) <= 500)) return stored;
  if (stored) { item.latitude = null; item.longitude = null; }
  let point = knownDestinationPoint(item);
  if (!point) {
    const queries = [
      destinationAliases(item),
      [item.place, trip?.destination, trip?.country].filter(Boolean).join(', '),
      [item.title, trip?.destination, trip?.country].filter(Boolean).join(', '),
      [item.place, trip?.destination].filter(Boolean).join(', '),
    ].filter((value, index, all) => value && all.indexOf(value) === index);
    for (const query of queries) {
      try {
        const rows = await limitedNominatim(query, context, true);
        const candidates = rows.map(x => [Number(x.lat), Number(x.lon)]).filter(x => Number.isFinite(x[0]) && Number.isFinite(x[1]));
        point = candidates.find(x => !context || geoDistanceKm(context, x) <= 500) || null;
        if (point) break;
      } catch (_) {}
    }
  }
  if (!point) return null;
  if (!item._virtual) {
    const { error } = await sb.from('itinerary_items').update({ latitude:point[0], longitude:point[1], geocoded_at:new Date().toISOString() }).eq('id', item.id);
    if (error) console.warn('[tripmate] corrected coordinate save failed', error);
  }
  item.latitude = point[0]; item.longitude = point[1];
  return point;
};

ensurePdfCoords = async function(items) {
  tripDestinationContextPromise = null;
  tripDestinationContextKey = '';
  for (const item of items) {
    if (item.item_type === 'flight') continue;
    try { await geocodeItem(item); } catch (_) {}
  }
  return items;
};

routeSvg = function(items) {
  const source = items.filter(x => x.item_type !== 'flight');
  if (!source.length) return '<div style="height:360px;display:flex;align-items:center;justify-content:center;color:#64748b">표시할 일정이 없습니다.</div>';
  const located = source.filter(x => x.latitude != null && x.longitude != null);
  const W=620,H=420,pad=52;
  let points;
  if (located.length >= 2) {
    let minx=Math.min(...located.map(x=>Number(x.longitude))),maxx=Math.max(...located.map(x=>Number(x.longitude))),miny=Math.min(...located.map(x=>Number(x.latitude))),maxy=Math.max(...located.map(x=>Number(x.latitude)));
    if(maxx===minx)maxx=minx+.01;if(maxy===miny)maxy=miny+.01;
    points=located.map((item,index)=>({x:pad+(Number(item.longitude)-minx)/(maxx-minx)*(W-pad*2),y:H-pad-(Number(item.latitude)-miny)/(maxy-miny)*(H-pad*2),title:item.title||item.place||'일정',n:index+1}));
  } else {
    points=source.slice(0,12).map((item,index,array)=>({x:pad+(index%2?W-pad*2:0),y:95+index*Math.min(42,270/Math.max(1,array.length-1)),title:item.title||item.place||'일정',n:index+1}));
  }
  const path=points.map(p=>`${p.x},${p.y}`).join(' ');
  const circles=points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="14" fill="#ef4444" stroke="#fff" stroke-width="4"/><text x="${p.x}" y="${p.y+4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${p.n}</text>`).join('');
  const labels=points.map((p,index)=>`<text x="${p.x+(index%2?-18:18)}" y="${p.y-19}" text-anchor="${index%2?'end':'start'}" font-size="11" font-weight="700" fill="#123a72">${e(p.title).slice(0,18)}</text>`).join('');
  const note=located.length>=2?'좌표 기반 일정 순서 동선':'일부 좌표 검색 실패로 일정 순서 기반 도식 표시';
  return `<svg viewBox="0 0 ${W} ${H}" width="620" height="420" style="display:block;width:100%;height:100%" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="routeGridV39" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#dbe8f7" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" rx="20" fill="#f4f8ff"/><rect width="${W}" height="${H}" rx="20" fill="url(#routeGridV39)"/><polyline points="${path}" fill="none" stroke="#2f6fd6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 9"/>${circles}${labels}<text x="28" y="35" font-size="17" font-weight="800" fill="#123a72">DAY ROUTE MAP</text><text x="28" y="57" font-size="11" fill="#64748b">${note}</text></svg>`;
};
