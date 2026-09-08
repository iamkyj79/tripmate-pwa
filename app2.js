const transportLabels={flight:'✈ 항공',train:'🚆 기차',bus:'🚌 버스',ferry:'⛴ 선박',car:'🚗 차량',other:'↔ 기타'};
function tday(v){if(!trip?.start_date||!v)return 1;let a=new Date(trip.start_date+'T00:00:00'),b=new Date(v);let n=Math.floor((new Date(b.getFullYear(),b.getMonth(),b.getDate())-a)/86400000)+1;return Math.max(1,n)}
function ttime(v){if(!v)return null;let d=new Date(v);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
