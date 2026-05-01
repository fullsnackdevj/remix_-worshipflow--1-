/**
 * LiveDisplayLocalPage — OBS Browser Source (LOCAL / OFFLINE mode)
 * URL: /live-display-local
 *
 * Connection priority (additive — does NOT touch LiveDisplayPage):
 *   1. SSE  /api/live-sse   — instant push, works 100% offline on LAN (walkie-talkie)
 *   2. Poll /api/live-state — 300ms fallback if SSE connection drops
 *
 * Identical rendering to LiveDisplayPage. No Firestore dependency at all.
 */
import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";

type AnimStyle = "fade"|"slide-up"|"word-fade"|"word-bounce"|"typewriter"|"blur-in"|"echo"|"breathe";
interface LiveState {
  songTitle: string; lines: string[]; animStyle: AnimStyle; visible: boolean; updatedAt: number;
  bgIdx?: number; echoAlign?: "center"|"centered-left"|"left"; echoLines?: "auto"|"2"|"3";
  echoLineHeight?: number; lyricsScale?: number; loopEnabled?: boolean; loopInterval?: number;
  bgVideo?: {type:"local";url:string}|{type:"firebase";url:string;localUrl?:string}|{type:"youtube";videoId:string}|null;
  transitioning?: boolean; fadeScreen?: boolean;
  fadeScreenBg?: {type:"color";color:string}|{type:"image-url";url:string}|{type:"image-local";url:string}|{type:"image-firebase";url:string}|{type:"video-local";url:string}|{type:"video-firebase";url:string}|{type:"video-youtube";videoId:string};
  _fadeOnly?: boolean;
}

// ⚠️ MUST match BG_PRESETS in LiveStageView.tsx exactly — index maps to bgIdx in payload
const BG_PRESETS = [
  "linear-gradient(135deg,#0a0a14 0%,#1a0a2e 50%,#0d1a2e 100%)", // Stage Dark
  "linear-gradient(135deg,#0d0014 0%,#1a003a 60%,#000814 100%)", // Deep Purple
  "linear-gradient(135deg,#140a00 0%,#2e1500 60%,#0a0a00 100%)", // Warm Night
  "#000",                                                          // Pure Black
];
const SACRED_WORDS = new Set(['jesus','christ','diyos','dios','god','lord','yahweh','jehovah','emmanuel']);
function isSacred(w: string) { return SACRED_WORDS.has(w.toLowerCase().replace(/[^a-z]/g,'')); }
const FUNC_WORDS = new Set(['a','an','the','to','of','in','at','by','for','on','and','or','but','is','are','was','were','i','we','he','she','it','my','our','your','his','her','its']);
function echoWordSm(word: string, gIdx: number): number {
  if (isSacred(word)) return 1.75;
  if (FUNC_WORDS.has(word.toLowerCase())) return 0.62;
  const hash = word.toLowerCase().split('').reduce((a,c)=>a+c.charCodeAt(0),0)+gIdx*11;
  return (hash%3===0)?0.68:1.30;
}
function animIn(el: HTMLElement, style: AnimStyle) {
  const ws=Array.from(el.querySelectorAll<HTMLElement>(".pw"));
  const cs=Array.from(el.querySelectorAll<HTMLElement>(".pc"));
  const ls=Array.from(el.querySelectorAll<HTMLElement>(".pl"));
  gsap.killTweensOf([...ws,...cs,...ls,el]);
  gsap.set([...ws,...cs,...ls,el],{clearProps:"opacity,transform,filter,scale"});
  if      (style==="fade")       gsap.fromTo(el,{opacity:0},{opacity:1,duration:0.8,ease:"power2.out"});
  else if (style==="slide-up")   gsap.fromTo(ls,{opacity:0,y:32},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.1});
  else if (style==="word-fade")  { gsap.set(ls,{opacity:1}); gsap.set(ws,{opacity:0}); gsap.to(ws,{opacity:1,duration:0.4,ease:"power2.out",stagger:0.07}); }
  else if (style==="word-bounce"){ gsap.set(ls,{opacity:1}); gsap.set(ws,{opacity:0,y:22,scale:0.65}); gsap.to(ws,{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(2.2)",stagger:0.065}); }
  else if (style==="typewriter") { gsap.set(ls,{opacity:1}); gsap.set(cs,{opacity:0}); gsap.to(cs,{opacity:1,duration:0.01,stagger:0.03,ease:"none"}); }
  else if (style==="blur-in")    { gsap.set(ls,{opacity:1}); gsap.fromTo(ws,{opacity:0,filter:"blur(18px)",scale:1.06},{opacity:1,filter:"blur(0px)",scale:1,duration:0.65,ease:"power2.out",stagger:0.07}); }
  else if (style==="echo") { gsap.set(el,{opacity:1}); gsap.set(ws,{opacity:0,scale:0.35,y:20}); gsap.to(ws,{opacity:1,scale:1,y:0,duration:0.4,ease:"back.out(2.8)",stagger:{amount:0.55}}); }
  else if (style==="breathe") {
    gsap.set(ls,{opacity:1}); gsap.set(ws,{opacity:0,scale:1.05,filter:"blur(6px)"});
    const st=ws.length>1?Math.min(0.45,0.7/ws.length):0.45;
    gsap.to(ws,{opacity:1,scale:1,filter:"blur(0px)",duration:1.8,ease:"sine.inOut",stagger:st});
  }
}
function idleLoop(el: HTMLElement, style: AnimStyle, interval=3500): ()=>void {
  let active=true;
  const id=setInterval(()=>{
    if(!active)return;
    const t=Array.from(el.querySelectorAll<HTMLElement>(".pw,.pc,.pl"));
    const ft=t.length?t:[el];
    gsap.to(ft,{opacity:0,duration:0.25,ease:"power2.in",onComplete:()=>{ if(active)animIn(el,style); }});
  },interval);
  return ()=>{ active=false; clearInterval(id); };
}
function renderLine(line: string, style: AnimStyle): React.ReactElement[] {
  if(style==="typewriter") return line.split("").map((ch,i)=><span key={i} className="pc" style={{display:"inline"}}>{ch===" "?"\u00a0":ch}</span>);
  return line.split(/(\s+)/).filter(Boolean).map((tok,i)=>{
    if(!tok.trim()) return <span key={i}>&nbsp;</span>;
    if(isSacred(tok)) return <span key={i} className="pw" style={{display:"inline-block",marginRight:"0.22em",fontSize:"1.45em",fontWeight:900,textShadow:"0 0 30px rgba(255,220,80,0.55), 0 3px 40px rgba(0,0,0,0.99)",verticalAlign:"middle"}}>{tok}</span>;
    return <span key={i} className="pw" style={{display:"inline-block",marginRight:"0.22em"}}>{tok}</span>;
  });
}
function makeSpan(word: string, gIdx: number, efs: number): React.ReactElement {
  const sm=echoWordSm(word,gIdx); const sacred=isSacred(word);
  return <span key={gIdx} className="pw" style={{fontSize:Math.round(efs*sm),fontWeight:900,letterSpacing:sm>1?"-0.03em":"-0.01em",lineHeight:0.9,color:"#fff",textShadow:sacred?"0 0 40px rgba(255,220,80,0.65), 0 3px 40px rgba(0,0,0,0.99)":"0 3px 40px rgba(0,0,0,0.99)",textTransform:"uppercase",display:"inline-block",verticalAlign:"baseline"}}>{word}</span>;
}

export default function LiveDisplayLocalPage() {
  const [live, setLive]             = useState<LiveState|null>(null);
  const [connected, setConnected]   = useState(false);
  const [connMode, setConnMode]     = useState<"sse"|"poll"|"connecting">("connecting");
  const [echoText, setEchoText]     = useState("");
  const [fadeBlack, setFadeBlack]   = useState(false);
  const [fadeScreen, setFadeScreen] = useState<LiveState["fadeScreenBg"]|null>(null);
  const prevFadeScreenRef = useRef<LiveState["fadeScreenBg"]|null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const lyricsRef   = useRef<HTMLDivElement>(null);
  const marqueeRef  = useRef<HTMLDivElement>(null);
  const lastKeyRef  = useRef("");
  const animatingRef= useRef(false);
  const echoTimerRef= useRef<ReturnType<typeof setTimeout>|null>(null);
  const loopCleanupRef = useRef<(()=>void)|null>(null);
  const rafRef         = useRef<number|null>(null);
  const marqueeTrackTweens = useRef<gsap.core.Tween[]>([]);

  const [box, setBox] = useState({w:0,h:0});
  useEffect(()=>{
    const el=wrapperRef.current; if(!el)return;
    const measure=()=>setBox({w:el.clientWidth,h:el.clientHeight});
    measure();
    const ro=new ResizeObserver(measure); ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  const fs = box.w>0 ? Math.round(box.w*0.10) : 192;

  // Ignore fadeScreen on the FIRST state received — it's stale from a previous
  // session. Fade should only activate from a live controller push this session.
  const isFirstStateRef = useRef(true);

  // ── Core state applier (shared by SSE + poll) ─────────────────────────────
  const applyState = (data: LiveState) => {
    const key=`${data.updatedAt}`;
    if(key===lastKeyRef.current) return;
    lastKeyRef.current=key;
    if(data.transitioning){ setFadeBlack(true); return; }
    setFadeBlack(false);
    // Strip fadeScreen on first state — prevents stale overlay from blocking OBS on load
    const suppressFade = isFirstStateRef.current;
    isFirstStateRef.current = false;
    if(!suppressFade && data.fadeScreen){
      const bg=data.fadeScreenBg??{type:"color",color:"#000"};
      prevFadeScreenRef.current=bg; setFadeScreen(bg as LiveState["fadeScreenBg"]);
    } else { setFadeScreen(null); }
    if(data._fadeOnly) return;
    const lyricsEl=lyricsRef.current;
    if(!lyricsEl){ setLive(data); return; }
    if(loopCleanupRef.current){ loopCleanupRef.current(); loopCleanupRef.current=null; }
    if(rafRef.current!==null){ cancelAnimationFrame(rafRef.current); rafRef.current=null; }
    gsap.killTweensOf(lyricsEl);
    const ac=Array.from(lyricsEl.querySelectorAll("*"));
    gsap.killTweensOf(ac); gsap.set(ac,{clearProps:"opacity,transform,filter,scale"});
    if(data.visible&&data.lines.length>0){
      animatingRef.current=true;
      gsap.to(lyricsEl,{opacity:0,duration:0.2,ease:"power2.in",onComplete:()=>{
        setLive(data);
        rafRef.current=requestAnimationFrame(()=>requestAnimationFrame(()=>{
          rafRef.current=null;
          gsap.set(lyricsEl,{opacity:1});
          gsap.set(Array.from(lyricsEl.querySelectorAll("*")),{clearProps:"opacity,transform,filter,scale"});
          animIn(lyricsEl,data.animStyle);
          animatingRef.current=false;
          if(data.loopEnabled!==false)
            loopCleanupRef.current=idleLoop(lyricsEl,data.animStyle,data.loopInterval??3500);
        }));
      }});
    } else {
      animatingRef.current=false;
      gsap.to(lyricsEl,{opacity:0,duration:0.35,ease:"power2.in",onComplete:()=>setLive(data)});
    }
  };

  // ── Connection: SSE primary, poll fallback ────────────────────────────────
  useEffect(()=>{
    let pollInterval: ReturnType<typeof setInterval>|null=null;
    let es: EventSource|null=null;
    let sseOk=false;

    const startPoll=()=>{
      if(pollInterval) return;
      setConnMode("poll");
      pollInterval=setInterval(async()=>{
        try{
          const r=await fetch("/api/live-state",{cache:"no-store"});
          if(!r.ok) return;
          applyState(await r.json()); setConnected(true);
        } catch { setConnected(false); }
      },300);
    };

    const stopPoll=()=>{ if(pollInterval){ clearInterval(pollInterval); pollInterval=null; } };

    const connectSSE=()=>{
      es=new EventSource("/api/live-sse");
      es.onopen=()=>{ sseOk=true; stopPoll(); setConnected(true); setConnMode("sse"); console.log("[LiveDisplayLocal] SSE connected"); };
      es.onmessage=(e)=>{ try{ applyState(JSON.parse(e.data)); setConnected(true); }catch{} };
      es.onerror=()=>{
        sseOk=false; setConnected(false);
        console.warn("[LiveDisplayLocal] SSE error — falling back to polling");
        es?.close(); es=null;
        startPoll();
        // retry SSE after 5s
        setTimeout(()=>{ if(!sseOk){ stopPoll(); connectSSE(); } },5000);
      };
    };

    connectSSE();
    return ()=>{ es?.close(); stopPoll(); };
  },[]); // eslint-disable-line

  // ── Echo marquee ─────────────────────────────────────────────────────────
  useEffect(()=>{
    if(echoTimerRef.current){ clearTimeout(echoTimerRef.current); echoTimerRef.current=null; }
    marqueeTrackTweens.current.forEach(t=>t.kill()); marqueeTrackTweens.current=[];
    if(marqueeRef.current){ gsap.killTweensOf(marqueeRef.current); gsap.set(marqueeRef.current,{opacity:0}); }
    if(lyricsRef.current){ gsap.killTweensOf(lyricsRef.current); gsap.set(lyricsRef.current,{scale:1,clearProps:"scale"}); }
    setEchoText("");
    if(!live||!live.visible||live.animStyle!=="echo") return;
    let cancelled=false;
    setEchoText(live.lines[0]??"");
    echoTimerRef.current=setTimeout(()=>{
      if(cancelled) return;
      const container=marqueeRef.current; if(!container) return;
      const tracks=Array.from(container.querySelectorAll<HTMLElement>(".mqtrack"));
      gsap.to(container,{opacity:1,duration:0.7,ease:"power2.out"});
      tracks.forEach((track,i)=>{
        const goLeft=i%2===0; const dur=18+i*2.5; const startFrac=(i*0.13)%0.5;
        if(goLeft){
          const t1=gsap.fromTo(track,{x:`-${startFrac*100}%`},{x:"-50%",duration:dur*(0.5-startFrac),ease:"none",onComplete:()=>{ if(!cancelled){ const t2=gsap.fromTo(track,{x:"0%"},{x:"-50%",duration:dur,ease:"none",repeat:-1}); marqueeTrackTweens.current.push(t2); } }});
          marqueeTrackTweens.current.push(t1);
        } else {
          const t1=gsap.fromTo(track,{x:`-${(0.5-startFrac)*100}%`},{x:"0%",duration:dur*(0.5-startFrac),ease:"none",onComplete:()=>{ if(!cancelled){ const t2=gsap.fromTo(track,{x:"-50%"},{x:"0%",duration:dur,ease:"none",repeat:-1}); marqueeTrackTweens.current.push(t2); } }});
          marqueeTrackTweens.current.push(t1);
        }
      });
      if(lyricsRef.current&&!cancelled){
        const b=gsap.to(lyricsRef.current,{scale:1.018,duration:5,ease:"sine.inOut",yoyo:true,repeat:-1,transformOrigin:"center"});
        marqueeTrackTweens.current.push(b as unknown as gsap.core.Tween);
      }
    },550);
    return ()=>{ cancelled=true; if(echoTimerRef.current){ clearTimeout(echoTimerRef.current); echoTimerRef.current=null; } marqueeTrackTweens.current.forEach(t=>t.kill()); marqueeTrackTweens.current=[]; if(marqueeRef.current){ gsap.killTweensOf(marqueeRef.current); gsap.set(marqueeRef.current,{opacity:0}); } if(lyricsRef.current){ gsap.killTweensOf(lyricsRef.current); gsap.set(lyricsRef.current,{scale:1,clearProps:"scale"}); } setEchoText(""); };
  },[live]); // eslint-disable-line

  // ── Echo render ───────────────────────────────────────────────────────────
  const renderEcho=(data:LiveState,fsVal:number):React.ReactElement=>{
    const allWords=data.lines.flatMap(l=>l.split(/\s+/).filter(Boolean));
    const echoAlign=data.echoAlign??"center"; const echoLinesV=data.echoLines??"auto";
    const echoLineHeight=data.echoLineHeight??1.0; const lineCount=echoLinesV==="auto"?null:parseInt(echoLinesV);
    const jc=echoAlign==="center"?"center":"flex-start"; const ml=echoAlign==="left"?"0":"0 auto";
    const CHAR_W=0.63; const GAP_R=0.18; const maxPx=box.w*0.88; const availH=box.h*0.82;
    const safeFsForRows=(rows:string[][],desiredFs:number):number=>{
      let safe=desiredFs; let gIdx=0;
      for(const row of rows){
        const rf=row.reduce((sum,word,wi)=>{ const sm=echoWordSm(word,gIdx+wi); return sum+word.length*CHAR_W*sm+(wi>0?GAP_R:0); },0);
        gIdx+=row.length; if(rf>0) safe=Math.min(safe,maxPx/rf);
      }
      return Math.round(Math.max(safe,fsVal*0.80));
    };
    if(lineCount){
      const rowSize=Math.ceil(allWords.length/lineCount); const rows:string[][]=[];
      for(let i=0;i<allWords.length;i+=rowSize) rows.push(allWords.slice(i,i+rowSize));
      const desired=fsVal*(lineCount===2?1.25:1.45); const widthFs=safeFsForRows(rows,desired);
      let gIdxH=0;
      const rowMaxSms=rows.map(row=>{ const m=row.reduce((acc,w,wi)=>Math.max(acc,echoWordSm(w,gIdxH+wi)),0)||1.0; gIdxH+=row.length; return m; });
      const totalSmH=rowMaxSms.reduce((a,b)=>a+b,0); const gapH=(rows.length-1)*echoLineHeight*0.10;
      const maxFsByH=availH/(totalSmH+gapH); const echoFs=Math.min(widthFs,Math.round(maxFsByH));
      const rowGap=Math.max(4,Math.round(echoFs*echoLineHeight*0.10)); let gIdx=0;
      return <div style={{display:"flex",flexDirection:"column",alignItems:echoAlign==="center"?"center":"flex-start",gap:`${rowGap}px`,maxWidth:`${maxPx}px`,margin:ml}}>{rows.map((rw,ri)=><div key={ri} style={{display:"flex",justifyContent:jc,alignItems:"baseline",gap:`${Math.round(echoFs*0.18)}px`}}>{rw.map(word=>makeSpan(word,gIdx++,echoFs))}</div>)}</div>;
    }
    const maxWordLen=allWords.reduce((m,w)=>Math.max(m,w.length),0);
    const maxFsWord=maxWordLen>0?(maxPx*0.80)/(maxWordLen*CHAR_W*1.30):fsVal;
    const estRows=Math.max(1,Math.round(allWords.length/3));
    const maxFsByH=availH/(estRows*1.40+(estRows-1)*echoLineHeight*0.10);
    const autoFs=Math.round(Math.min(fsVal,maxFsWord,maxFsByH));
    const autoRowGap=Math.max(2,Math.round(autoFs*echoLineHeight*0.05));
    return <div style={{display:"flex",flexWrap:"wrap",justifyContent:jc,alignItems:"baseline",gap:`${autoRowGap}px ${Math.round(autoFs*0.18)}px`,maxWidth:`${maxPx}px`,margin:ml}}>{allWords.map((word,i)=>makeSpan(word,i,autoFs))}</div>;
  };

  const bgStyle   = BG_PRESETS[live?.bgIdx??0]??BG_PRESETS[0];
  const isVisible = live?.visible&&(live?.lines?.length??0)>0;
  const NUM_ROWS  = 5; const GAP = "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0";

  return (
    <div ref={wrapperRef} style={{position:"fixed",inset:0,background:bgStyle,transition:"background 0.6s ease",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",padding:box.h>0?`${box.h*0.08}px ${box.w*0.05}px`:"8% 5%"}}>
      {/* Fade-to-black transition */}
      <div style={{position:"absolute",inset:0,zIndex:100,background:"#000",opacity:fadeBlack?1:0,transition:"opacity 0.5s ease",pointerEvents:"none"}} />
      {/* Fade screen overlay */}
      {(()=>{
        const bg=fadeScreen??prevFadeScreenRef.current;
        const bgUrl=(bg as {type?:string;url?:string})?.url??"";
        const ytId=(bg as {type?:string;videoId?:string})?.videoId??"";
        return (
          <div style={{position:"absolute",inset:0,zIndex:90,opacity:fadeScreen?1:0,transition:"opacity 0.7s ease",pointerEvents:"none",background:bg?.type==="color"?(bg as {type:"color";color:string}).color:"#000"}}>
            {bg&&(bg.type==="image-url"||bg.type==="image-local"||bg.type==="image-firebase")&&bgUrl&&<img src={bgUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />}
            {bg&&(bg.type==="video-local"||bg.type==="video-firebase")&&bgUrl&&<video key={bgUrl} src={bgUrl} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />}
            {bg&&bg.type==="video-youtube"&&ytId&&<iframe key={ytId} src={`https://www.youtube.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&muted=1&controls=0&disablekb=1&fs=0&modestbranding=1&iv_load_policy=3`} style={{width:"100%",height:"100%",border:"none",pointerEvents:"none",display:"block"}} allow="autoplay; encrypted-media" title="fade-video-bg" />}
          </div>
        );
      })()}
      {/* Video background — local/firebase (offline fallback) / youtube */}
      {live?.bgVideo&&(()=>{
        const bv=live.bgVideo!;
        if(bv.type==="local"||bv.type==="firebase"){
          // live-display-local = LOCAL mode. ALWAYS use localUrl (local server) for firebase-type
          // videos. navigator.onLine is unreliable in OBS CEF — it returns true even when there
          // is no internet, so we can't trust it. localUrl (/api/live-bg-video/:preset) is always
          // served from this same dev server and never needs internet.
          const src = bv.localUrl || bv.url;
          return(
            <div style={{position:"absolute",inset:0,overflow:"hidden",zIndex:0}}>
              <video key={src} src={src} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}} />
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}} />
            </div>
          );
        }
        if(bv.type==="youtube"){
          return(
            <div style={{position:"absolute",inset:0,overflow:"hidden",zIndex:0}}>
              <iframe key={bv.videoId} src={`https://www.youtube.com/embed/${bv.videoId}?autoplay=1&loop=1&playlist=${bv.videoId}&mute=1&muted=1&controls=0&disablekb=1&fs=0&modestbranding=1&iv_load_policy=3&enablejsapi=1`} style={{width:"100%",height:"100%",border:"none",pointerEvents:"none"}} allow="autoplay; encrypted-media" title="video-bg" />
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}} />
            </div>
          );
        }
        return null;
      })()}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.7) 100%)",pointerEvents:"none",zIndex:0}} />
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 70% 35% at 50% 25%, rgba(100,60,220,0.07) 0%, transparent 70%)",pointerEvents:"none",zIndex:0}} />
      {/* Echo marquee */}
      {echoText&&(
        <div ref={marqueeRef} style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",overflow:"hidden",opacity:0,zIndex:0,pointerEvents:"none"}}>
          {Array.from({length:NUM_ROWS},(_,i)=>{
            const track=`${echoText}${GAP}${echoText}${GAP}`;
            return <div key={i} style={{flex:1,overflow:"hidden",display:"flex",alignItems:"center"}}><div className="mqtrack" style={{whiteSpace:"nowrap",display:"inline-block",fontSize:fs*1.8,fontWeight:900,letterSpacing:"-0.02em",lineHeight:1,color:"rgba(255,255,255,0.14)",userSelect:"none"}}>{track}</div></div>;
          })}
        </div>
      )}
      {/* Lyrics */}
      <div style={{position:"relative",zIndex:1,width:"100%",textAlign:"center",transform:`scale(${live?.lyricsScale??1})`,transformOrigin:"center center"}}>
        <div ref={lyricsRef} style={{opacity:0,width:"100%"}}>
          {isVisible&&live&&(
            live.animStyle==="echo"
              ? renderEcho(live,fs)
              : live.lines.map((line,i)=>(
                  <p key={`${live.updatedAt}-${i}`} className="pl" style={{margin:`0 0 ${Math.round(fs*(live.echoLineHeight??1.0)*0.18)}px`,lineHeight:live.echoLineHeight??1.0,fontSize:fs,fontWeight:900,color:"#fff",textShadow:"0 3px 40px rgba(0,0,0,0.99), 0 2px 8px rgba(0,0,0,0.95)",letterSpacing:"-0.02em",display:"block",width:"100%",whiteSpace:"normal",wordBreak:"normal",overflowWrap:"normal"}}>
                    {renderLine(line,live.animStyle)}
                  </p>
                ))
          )}
          {!isVisible&&<p style={{fontSize:Math.max(12,Math.round(fs*0.14)),color:"rgba(255,255,255,0.08)",letterSpacing:"0.1em",fontWeight:600}}>● DISPLAY CLEAR</p>}
        </div>
      </div>
      {/* Status dot — shows connection mode */}
      <div style={{position:"fixed",bottom:12,right:16,fontSize:10,fontFamily:"monospace",fontWeight:700,letterSpacing:"0.05em",pointerEvents:"none",userSelect:"none",zIndex:99,color:connected?"rgba(52,211,153,0.55)":"rgba(239,68,68,0.55)"}}>
        {connected ? `● LIVE (${connMode.toUpperCase()})` : "● CONNECTING…"}
      </div>
    </div>
  );
}
