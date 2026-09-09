// v43: keep every numbered stop visible when several itinerary places share a geocoded point.
(function installOverlappingMarkerSpread(){
  const originalDrawDayMap=window.drawDayMap;
  if(typeof originalDrawDayMap!=='function'||!window.L)return;
  window.drawDayMap=async function(rows,day,mode){
    const originalMarker=L.marker;
    const displayed=[];
    L.marker=function(latlng,options){
      let markerPoint=latlng;
      if(options?.icon?.options?.className==='numbered-map-marker-wrap'){
        const point=[Number(latlng[0]),Number(latlng[1])];
        const overlaps=displayed.filter(value=>geoDistanceKm(value,point)<0.09).length;
        if(overlaps){
          const slot=overlaps-1,angle=(-90+(slot%6)*60)*Math.PI/180,ring=1+Math.floor(slot/6);
          const longitudeScale=Math.max(.35,Math.cos(point[0]*Math.PI/180));
          markerPoint=[point[0]+Math.sin(angle)*.00042*ring,point[1]+Math.cos(angle)*.00042*ring/longitudeScale];
        }
        displayed.push(point);
      }
      return originalMarker.call(L,markerPoint,options);
    };
    try{return await originalDrawDayMap(rows,day,mode)}finally{L.marker=originalMarker}
  };
})();
