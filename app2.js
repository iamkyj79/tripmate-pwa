const transportLabels={flight:'✈ 항공',train:'🚆 기차',bus:'🚌 버스',ferry:'⛴ 선박',car:'🚗 차량',other:'↔ 기타'};
function localParts(v){if(!v)return null;let s=String(v).slice(0,16),m=s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);if(!m)return null;return {y:+m[1],mo:+m[2],d:+m[3],h:+m[4],mi:+m[5]}}
function tday(v){if(!trip?.start_date||!v)return 1;let p=localParts(v);if(!p){let d=new Date(v);p={y:d.getFullYear(),mo:d.getMonth()+1,d:d.getDate()}}let a=new Date(trip.start_date+'T00:00:00'),b=new Date(p.y,p.mo-1,p.d);return Math.max(1,Math.floor((b-a)/86400000)+1)}
function ttime(v){if(!v)return null;let p=localParts(v);if(p)return String(p.h).padStart(2,'0')+':'+String(p.mi).padStart(2,'0');let d=new Date(v);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function toLocalInput(v){if(!v)return '';let p=localParts(v);if(p)return String(v).slice(0,16);return dtlocal(v)}
function localMinuteKey(v){let p=localParts(v);if(!p)return null;return Date.UTC(p.y,p.mo-1,p.d,p.h,p.mi)/60000}
