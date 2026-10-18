(function (root) {
  const EPS = 1e-9;
  // Fixed-heading capsules at constant relative velocity. The Minkowski sum of
  // their two axes is a segment or parallelogram, rounded by both body radii.
  function hull(points) {
    const sorted = points.slice().sort((a,b) => a.x-b.x || a.y-b.y)
      .filter((p,i,all) => !i || p.x !== all[i-1].x || p.y !== all[i-1].y);
    const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    function chain(values) {
      const result=[];
      for(const p of values) {
        while(result.length>1 && cross(result.at(-2),result.at(-1),p)<=0) result.pop();
        result.push(p);
      }
      return result.slice(0,-1);
    }
    return [...chain(sorted),...chain([...sorted].reverse())];
  }
  function circleEntry(position, velocity, center, radius, horizon) {
    const x=position.x-center.x,y=position.y-center.y;
    const speed2=velocity.x*velocity.x+velocity.y*velocity.y;
    const c=x*x+y*y-radius*radius;
    if(c<=EPS) return 0;
    if(speed2<=EPS*EPS) return Infinity;
    const dot=x*velocity.x+y*velocity.y;
    if(dot>=0) return Infinity;
    const discriminant=dot*dot-speed2*c;
    if(discriminant < -EPS) return Infinity;
    // Stable smaller root (avoids subtracting nearly equal large numbers).
    const time=c/(-dot+Math.sqrt(Math.max(0,discriminant)));
    return time>=0 && time<=horizon+EPS ? Math.min(time,horizon) : Infinity;
  }
  function edgeEntry(position,velocity,a,b,radius,horizon) {
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    let earliest=Math.min(circleEntry(position,velocity,a,radius,horizon),circleEntry(position,velocity,b,radius,horizon));
    if(length<EPS) return earliest;
    const ux=dx/length,uy=dy/length,px=position.x-a.x,py=position.y-a.y;
    let lo=0,hi=horizon;
    for(const [value,rate,min,max] of [[px*ux+py*uy,velocity.x*ux+velocity.y*uy,0,length],
      [-px*uy+py*ux,-velocity.x*uy+velocity.y*ux,-radius,radius]]) {
      if(Math.abs(rate)<EPS) {if(value<min-EPS || value>max+EPS) return earliest;}
      else {
        const first=(min-value)/rate,last=(max-value)/rate;
        lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));
        if(lo>hi+EPS) return earliest;
      }
    }
    return Math.min(earliest,Math.max(0,Math.min(lo,horizon)));
  }
  function impact(body,other,{horizon=60,margin=0}={}) {
    if(!Number.isFinite(horizon) || horizon<0 || !Number.isFinite(margin) || margin<0)
      throw new Error("Horizon et marge de prédiction doivent être finis et positifs ou nuls");
    if(body.id===other.id || body.dead || body.finished || other.dead || other.finished) return null;
    const relativeVelocity=createVector(other.vel.x-body.vel.x,other.vel.y-body.vel.y);
    const relativePosition=createVector(other.pos.x-body.pos.x,other.pos.y-body.pos.y);
    const radius=2*root.MotorcycleBody.RADIUS+margin;
    // Local dynamic perception: even at full relative speed, anything beyond
    // this bound cannot reach either 24px body during the prediction horizon.
    if(relativePosition.mag()>2*root.MotorcycleBody.HALF_AXIS+radius+relativeVelocity.mag()*horizon+EPS) return null;
    const clearance=root.MotorcycleBody.gap(body,other).clearance;
    let time=clearance<=margin+EPS ? 0 : Infinity;
    if(time!==0 && relativeVelocity.mag()>EPS) {
      const origin=createVector(0,0), ownAxis=root.MotorcycleBody.axis(origin,body.heading), otherAxis=root.MotorcycleBody.axis(origin,other.heading);
      const boundary=hull(ownAxis.flatMap(a=>otherAxis.map(b=>createVector(a.x-b.x,a.y-b.y))));
      for(let i=0;i<boundary.length;i++) time=Math.min(time,edgeEntry(relativePosition,relativeVelocity,
        boundary[i],boundary[(i+1)%boundary.length],radius,horizon));
    }
    if(!Number.isFinite(time)) return null;
    return {other, timeToImpact:time, secondsToImpact:time/60, clearance, margin,
      overlapping:clearance<=0, relativeVelocity,
      ownPosition:createVector(body.pos.x+body.vel.x*time,body.pos.y+body.vel.y*time),
      otherPosition:createVector(other.pos.x+other.vel.x*time,other.pos.y+other.vel.y*time)};
  }
  function threats(body,neighbors,options={}) {
    return neighbors.map(other=>impact(body,other,options)).filter(Boolean)
      .sort((a,b)=>a.timeToImpact-b.timeToImpact || a.clearance-b.clearance || a.other.id-b.other.id);
  }
  root.MotorcyclePrediction={impact,threats};
})(typeof globalThis !== "undefined" ? globalThis : this);
