const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {runtime}=require("./helpers/runtime.cjs");
function fixture(){
  const a=runtime();a.context.setTimeout=setTimeout;
  vm.runInContext(fs.readFileSync(path.join(__dirname,"..","grand-prix.js"),"utf8"),a.context);
  const p=Object.create(a.context.GrandPrixPresentation.prototype),nodes=new Map();
  p.get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:id==="launch"?"Lancer Grand Prix":"",disabled:false});return nodes.get(id);};
  p.notice={textContent:""};let starts=0,begins=0;
  p.startRace=()=>{starts++;p.notice.textContent="Course prête";p.race={begin(){begins++;}};return true;};
  return {p,counts:()=>({starts,begins})};
}
test("clic lancement indépendant d’une activation audio qui ne se termine jamais",async()=>{
  const {p,counts}=fixture();p.enableAudio=()=>new Promise(()=>{});
  const launch=p.launchRace();assert.equal(p.get("launch").disabled,true);
  assert.match(p.get("launch").textContent,/Vérification/);assert.match(p.notice.textContent,/homologation/);
  assert.equal(await p.launchRace(),false,"double clic ignoré");
  assert.equal(await launch,true);assert.deepEqual(counts(),{starts:1,begins:1});
  assert.equal(p.get("launch").disabled,false);assert.equal(p.get("launch").textContent,"Lancer Grand Prix");
  assert.equal(p.launchPending,false);
});
test("échec audio immédiat ou rejeté : course lancée et bouton réutilisable",async()=>{
  for(const fail of [()=>{throw new Error("périphérique absent");},()=>Promise.reject(new Error("autoplay"))]){
    const {p,counts}=fixture();p.enableAudio=fail;
    assert.equal(await p.launchRace(),true);assert.deepEqual(counts(),{starts:1,begins:1});
    assert.equal(p.get("audio").textContent,"Réessayer audio");assert.equal(p.notice.textContent,"Course prête");
    assert.equal(await p.launchRace(),true);assert.equal(counts().begins,2);
  }
});
test("grille refusée ou erreur inattendue : raison visible et verrou libéré",async()=>{
  const {p,counts}=fixture();p.enableAudio=()=>new Promise(()=>{});
  p.startRace=()=>{p.notice.textContent="Course impossible : Homologation refusée pilote 4";return false;};
  assert.equal(await p.launchRace(),false);assert.equal(p.get("grid").open,true);
  assert.match(p.notice.textContent,/pilote 4/);assert.equal(counts().begins,0);assert.equal(p.launchPending,false);
  p.startRace=()=>{throw new Error("GPU interrompu");};
  assert.equal(await p.launchRace(),false);assert.match(p.notice.textContent,/GPU interrompu/);
  assert.equal(p.get("launch").disabled,false);
});
test("résultat audio tardif ne remplace pas notice de course ou d’homologation",async()=>{
  const {p}=fixture();let resolve;
  p.audio={enabled:false,enable:()=>new Promise(done=>{resolve=done;}),error:"Audio indisponible"};
  const pending=p.enableAudio(false);p.notice.textContent="Homologation refusée pilote 4";
  resolve(false);assert.equal(await pending,false);assert.equal(p.notice.textContent,"Homologation refusée pilote 4");
  p.audio.enable=async()=>true;await p.enableAudio();assert.match(p.notice.textContent,/Audio actif/);
});
test("refus Grand Prix conservé quand entraînement devient MODEL VALIDATED",()=>{
  const {p}=fixture(),source={id:0},sim={mode:"validation",status:"modèle validé",population:[source],validationStats:[],generation:1,bestScore:6647,circuit:{trackWidth:44}};
  p.validationSource=source;p.validationRecorder={save:()=>[]};p.settings={replay:false};let cards=0;p.showValidation=()=>{cards++;};
  p.reportLaunchFailure("Homologation Grand Prix refusée — pilote 1 : mauvais sens");
  const refusal=p.notice.textContent;
  p.recordValidation(sim);
  assert.equal(cards,1,"validation laboratoire enregistrée normalement");
  assert.equal(p.notice.textContent,refusal,"validation ne masque pas refus de course");
  assert.equal(p.launchFailure,refusal);
});
test("refus persistant protège aussi contre annonce audio ; nouvelle tentative retire ancien état",async()=>{
  const {p}=fixture();p.reportLaunchFailure("Homologation Grand Prix refusée");
  p.audio={enabled:false,enable:async()=>true};
  await p.enableAudio();assert.match(p.notice.textContent,/Homologation/);
  assert.equal(await p.launchRace(),true);assert.equal(p.launchFailure,"");assert.equal(p.notice.textContent,"Course prête");
});

test("passage bloqué par obstacles : refus explicite avant départ", () => {
  const a = runtime();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "rider-roster.js"), "utf8"), a.context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "grand-prix.js"), "utf8"), a.context);
  const p = Object.create(a.context.GrandPrixPresentation.prototype);
  const nodes = new Map();
  const get = key => {
    if (!nodes.has(key)) nodes.set(key, { value: ({ laps: 3, light: 700, hold: 1200, model: "chosen" })[key] || "52" });
    return nodes.get(key);
  };
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "models-gp52", "agressif-gp52.json"), "utf8"));
  const genome = a.Genome.fromJSON(raw.genome);
  const current = {};
  const circuit = new a.Circuit(920, 720, 52);
  const pose = circuit.startPose();
  const forward = { x: Math.cos(pose.heading), y: Math.sin(pose.heading) };
  const normal = { x: -forward.y, y: forward.x };
  const blockingObs = [
    { x: pose.position.x + normal.x * 12, y: pose.position.y + normal.y * 12, radius: 18 },
    { x: pose.position.x - normal.x * 12, y: pose.position.y - normal.y * 12, radius: 18 }
  ];
  Object.assign(p, {
    race: current, notice: {}, settings: { inspired: false }, get,
    reportLaunchFailure: msg => { p.notice.textContent = msg; },
    host: {
      simulation: () => ({ inference: { setGenomes() {} } }),
      raceModel: () => ({ id: "chosen", name: "agressif", genome, metadata: { profileLabel: "agressif" } })
    },
    qualifyRoster: () => ({ passed: true, riders: [] }),
    pendingObstacles: blockingObs
  });
  const ok = p.startRace();
  assert.equal(ok, false);
  assert.match(p.notice.textContent, /Configuration impossible : passage totalement bloqué/);
});

