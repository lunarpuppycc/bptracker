import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ── Supabase config ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://rcwblmchjkqrbdbqtviu.supabase.co";
const SUPABASE_KEY = "sb_publishable_4qhzRpW_qHjs7ze3bXbd9A_q6UgZ13k";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const api = {
  getMembers: () => sb("members?select=*&order=id.asc"),
  addMember: (m) => sb("members", { method: "POST", body: JSON.stringify(m) }),
  updateMember: (id, m) => sb(`members?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(m) }),
  deleteMember: (id) => sb(`members?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  getRecords: (memberId) => sb(`records?member_id=eq.${memberId}&select=*&order=date.desc`),
  addRecord: (r) => sb("records", { method: "POST", body: JSON.stringify(r) }),
  deleteRecord: (id) => sb(`records?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
};

// ── classify & advice ─────────────────────────────────────────────────────────
const BP_CATEGORIES = [
  { label: "低血压",    color: "#60a5fa" },
  { label: "理想",      color: "#34d399" },
  { label: "正常高值",  color: "#fbbf24" },
  { label: "高血压1期", color: "#f97316" },
  { label: "高血压2期", color: "#ef4444" },
];

function classify(sys, dia, age) {
  const elderly = age && age >= 80;
  if (elderly) {
    if (sys >= 150 || dia >= 90) return BP_CATEGORIES[4];
    if (sys >= 140 || dia >= 85) return BP_CATEGORIES[3];
    if (sys >= 130)              return BP_CATEGORIES[2];
    if (sys >= 90  && dia >= 60) return BP_CATEGORIES[1];
    return BP_CATEGORIES[0];
  }
  if (sys >= 140 || dia >= 90) return BP_CATEGORIES[4];
  if (sys >= 130 || dia >= 80) return BP_CATEGORIES[3];
  if (sys >= 120)              return BP_CATEGORIES[2];
  if (sys >= 90  && dia >= 60) return BP_CATEGORIES[1];
  return BP_CATEGORIES[0];
}

function getAdvice(sys, dia, pulse, age) {
  const elderly = age && age >= 80;
  const cat = classify(sys, dia, age);
  const tips = [];
  if (elderly) {
    if (cat.label === "高血压2期" || cat.label === "高血压1期") {
      tips.push("血压偏高 注意饮食 少吃咸的");
      tips.push("💊若在服药，按时服用就行");
    } else if (cat.label === "正常高值") {
      tips.push("血压稍微偏高");
    } else if (cat.label === "理想") {
      tips.push("状态不错^_^");
    } else {
      tips.push("血压偏低 起身时慢一点 多喝水");
    }
  } else {
    if (cat.label === "高血压2期" || cat.label === "高血压1期") {
      tips.push("建议近期咨询医生 避免剧烈运动");
      tips.push("💊若在服药 记得按时吃药 记录变化");
      tips.push("避免高钠食物 少吃咸的");
    } else if (cat.label === "正常高值") {
      tips.push("保持低钠饮食");
      tips.push("🚶每天抽出一些时间散步有助于稳定血压");
    } else if (cat.label === "理想") {
      tips.push("✅血压状况良好，保持健康生活方式");
    } else {
      tips.push("多喝水 起身时缓慢一些");
    }
  }
  if (pulse && (pulse < 50 || pulse > 100))
    tips.push(`⚡ 心率${pulse < 50 ? "偏低" : "偏高"}（${pulse} bpm），留意一下`);
  return tips;
}

function fmt(ts) {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ── sub-components ────────────────────────────────────────────────────────────
function Badge({ cat }) {
  return (
    <span style={{ display:"inline-block", padding:"2px 10px", borderRadius:99,
      background:`${cat.color}22`, color:cat.color, fontSize:12, fontWeight:700,
      border:`1px solid ${cat.color}55` }}>{cat.label}</span>
  );
}

function RingGauge({ sys, dia, age }) {
  const cat = classify(sys, dia, age);
  const pct = Math.min((sys - 70) / 110, 1);
  const r = 44, cx = 56, cy = 56, circ = 2 * Math.PI * r;
  return (
    <svg width={112} height={112} style={{display:"block"}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={10}
        strokeDasharray={`${circ*0.75} ${circ}`} strokeDashoffset={-circ*0.125} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={cat.color} strokeWidth={10}
        strokeDasharray={`${pct*circ*0.75} ${circ}`} strokeDashoffset={-circ*0.125}
        strokeLinecap="round" style={{transition:"stroke-dasharray 0.6s ease"}} />
      <text x={cx} y={cy-6}  textAnchor="middle" fill="#f1f5f9" fontSize={20} fontWeight={800}>{sys}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fill="#94a3b8" fontSize={13}>{dia}</text>
      <text x={cx} y={cy+29} textAnchor="middle" fill="#64748b" fontSize={10}>mmHg</text>
    </svg>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"8px 14px",fontSize:12}}>
      <div style={{color:"#94a3b8",marginBottom:4}}>{label}</div>
      {payload.map(p => <div key={p.name} style={{color:p.color,fontWeight:600}}>{p.name}: {p.value}</div>)}
    </div>
  );
}

function MemberForm({ initial, onSave, onCancel, loading }) {
  const [f, setF] = useState(initial || { name:"", age:"", gender:"男", weight:"", note:"" });
  const inp = { width:"100%", background:"#0f172a", border:"1.5px solid #334155", borderRadius:12,
    padding:"11px 14px", color:"#f1f5f9", fontSize:15, outline:"none", boxSizing:"border-box" };
  const lbl = { fontSize:12, color:"#64748b", marginBottom:5, display:"block" };
  return (
    <div style={{background:"#1e293b",borderRadius:20,padding:"20px",margin:"14px 16px 0"}}>
      <div style={{fontSize:15,fontWeight:800,color:"#94a3b8",marginBottom:14}}>
        {initial ? "编辑成员信息" : "添加新成员"}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div><label style={lbl}>姓名</label>
          <input value={f.name} onChange={e=>setF(v=>({...v,name:e.target.value}))} placeholder="例：爸爸" style={inp} /></div>
        <div><label style={lbl}>年龄</label>
          <input type="number" value={f.age} onChange={e=>setF(v=>({...v,age:e.target.value}))} placeholder="例：65" style={inp} /></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
        <div><label style={lbl}>性别</label>
          <div style={{display:"flex",gap:8}}>
            {["男","女"].map(g => (
              <button key={g} onClick={()=>setF(v=>({...v,gender:g}))}
                style={{flex:1,padding:"11px 0",borderRadius:12,
                  border:`1.5px solid ${f.gender===g?"#60a5fa":"#334155"}`,
                  background:f.gender===g?"#1e3a5f":"#0f172a",
                  color:f.gender===g?"#60a5fa":"#64748b",
                  fontWeight:700,fontSize:14,cursor:"pointer"}}>
                {g==="男"?"👨 男":"👩 女"}
              </button>
            ))}
          </div>
        </div>
        <div><label style={lbl}>体重（kg）</label>
          <input type="number" value={f.weight} onChange={e=>setF(v=>({...v,weight:e.target.value}))} placeholder="例：65" style={inp} /></div>
      </div>
      <div style={{marginTop:10}}>
        <label style={lbl}>备注（病史 / 用药等，可选）</label>
        <input value={f.note} onChange={e=>setF(v=>({...v,note:e.target.value}))} placeholder="例：服用降压药、糖尿病史…" style={inp} />
      </div>
      <div style={{display:"flex",gap:10,marginTop:14}}>
        <button onClick={()=>onSave(f)} disabled={loading}
          style={{flex:1,background:"#2563eb",color:"#fff",border:"none",borderRadius:14,
            padding:"13px 0",fontSize:15,fontWeight:700,cursor:"pointer",opacity:loading?0.6:1}}>
          {loading?"保存中…":"保存"}
        </button>
        <button onClick={onCancel}
          style={{flex:1,background:"#0f172a",color:"#64748b",border:"1px solid #334155",
            borderRadius:14,padding:"13px 0",fontSize:15,fontWeight:700,cursor:"pointer"}}>
          取消
        </button>
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function BPTracker() {
  const [members, setMembers]       = useState([]);
  const [activeId, setActiveId]     = useState("");
  const [records, setRecords]       = useState([]);
  const [page, setPage]             = useState("home");
  const [form, setForm]             = useState({ sys:"", dia:"", pulse:"", note:"" });
  const [toast, setToast]           = useState(null);
  const [memberForm, setMemberForm] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [dbLoading, setDbLoading]   = useState(true);
  const [dbError, setDbError]       = useState(null);

  const showToast = useCallback((msg, type="ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load members on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getMembers();
        setMembers(data);
        if (data.length > 0) setActiveId(data[0].id);
        setDbError(null);
      } catch (e) {
        setDbError("无法连接到数据库 请检查网络");
      } finally {
        setDbLoading(false);
      }
    })();
  }, []);

  // Load records when active member changes
  useEffect(() => {
    if (!activeId) { setRecords([]); return; }
    (async () => {
      try {
        const data = await api.getRecords(activeId);
        setRecords(data);
      } catch { setRecords([]); }
    })();
  }, [activeId]);

  const activeMember = members.find(m => m.id === activeId);
  const age = activeMember ? parseInt(activeMember.age) || null : null;
  const latest = records[0];
  const advice = latest ? getAdvice(latest.sys, latest.dia, latest.pulse, age) : [];

  async function handleSaveBP() {
    const sys = parseInt(form.sys), dia = parseInt(form.dia), pulse = parseInt(form.pulse)||null;
    if (!sys || !dia || sys < 60 || sys > 250 || dia < 30 || dia > 150) {
      showToast("请输入合理的血压数值", "err"); return;
    }
    setLoading(true);
    try {
      const entry = { id: String(Date.now()), member_id: activeId, sys, dia, pulse, note: form.note.trim(), date: Date.now() };
      await api.addRecord(entry);
      setRecords(prev => [entry, ...prev]);
      setForm({ sys:"", dia:"", pulse:"", note:"" });
      showToast("✓ 已保存"); setPage("home");
    } catch { showToast("保存失败 请检查网络","err"); }
    finally { setLoading(false); }
  }

  async function handleDeleteRecord(record) {
    try {
      await api.deleteRecord(record.id);
      setRecords(prev => prev.filter(r => r.id !== record.id));
    } catch { showToast("删除失败","err"); }
  }

  async function handleSaveMember(f) {
    if (!f.name.trim()) { showToast("请输入姓名","err"); return; }
    setLoading(true);
    try {
      if (memberForm === "add") {
        const newM = { id: String(Date.now()), name:f.name.trim(), age:parseInt(f.age)||null, gender:f.gender, weight:parseFloat(f.weight)||null, note:f.note.trim() };
        await api.addMember(newM);
        setMembers(prev => [...prev, newM]);
        setActiveId(newM.id);
      } else {
        const updated = { name:f.name.trim(), age:parseInt(f.age)||null, gender:f.gender, weight:parseFloat(f.weight)||null, note:f.note.trim() };
        await api.updateMember(memberForm.id, updated);
        setMembers(prev => prev.map(m => m.id === memberForm.id ? { ...m, ...updated } : m));
      }
      setMemberForm(null); showToast("已保存ovo");
    } catch { showToast("保存失败 请检查网络:(","err"); }
    finally { setLoading(false); }
  }

  async function handleDeleteMember() {
    if (members.length <= 1) { showToast("至少保留一位成员","err"); return; }
    try {
      await api.deleteMember(activeId);
      const m2 = members.filter(m => m.id !== activeId);
      setMembers(m2); setActiveId(m2[0].id);
    } catch { showToast("删除失败","err"); }
  }

  const chartData = records.slice().sort((a,b)=>a.date-b.date).slice(-14)
    .map(r => ({ time: fmt(r.date), 收缩压: r.sys, 舒张压: r.dia }));

  const S = {
    app:   { maxWidth:430, margin:"0 auto", minHeight:"100vh", background:"#0f172a",
              fontFamily:"'Noto Sans SC', sans-serif", color:"#f1f5f9" },
    card:  { background:"#1e293b", borderRadius:20, padding:"20px", margin:"14px 16px 0" },
    input: { width:"100%", background:"#0f172a", border:"1.5px solid #334155", borderRadius:12,
              padding:"12px 14px", color:"#f1f5f9", fontSize:15, outline:"none", boxSizing:"border-box" },
    btn:   (bg, color="#fff", disabled=false) => ({
              background:bg, color, border:"none", borderRadius:14, padding:"13px 0",
              fontSize:15, fontWeight:700, width:"100%", cursor:"pointer", marginTop:8, opacity:disabled?0.6:1 }),
    navBtn:(active) => ({ display:"flex", flexDirection:"column", alignItems:"center", gap:3,
              background:"none", border:"none", color:active?"#60a5fa":"#475569",
              fontSize:10, fontWeight:active?700:400, cursor:"pointer", padding:"8px 16px" }),
  };

  if (dbLoading) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100vh",background:"#0f172a",color:"#94a3b8",gap:12}}>
      <div style={{fontSize:32}}>💓</div>
      <div>连接数据库中…</div>
    </div>
  );

  if (dbError) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100vh",background:"#0f172a",color:"#ef4444",gap:12,padding:24,textAlign:"center"}}>
      <div style={{fontSize:32}}>⚠️</div>
      <div>{dbError}</div>
      <button onClick={()=>window.location.reload()}
        style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",
          borderRadius:12,padding:"10px 24px",cursor:"pointer",fontSize:14}}>重试</button>
    </div>
  );

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&display=swap" rel="stylesheet" />

      {toast && (
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:999,
          background:toast.type==="err"?"#ef4444":"#10b981",color:"#fff",borderRadius:12,
          padding:"10px 22px",fontWeight:700,fontSize:14,boxShadow:"0 4px 24px #0008"}}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{padding:"24px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:18,fontWeight:800,letterSpacing:1}}>💓 家庭血压</div>
        <button onClick={()=>setMemberForm("add")}
          style={{background:"#1e293b",border:"none",color:"#60a5fa",borderRadius:10,
            padding:"6px 14px",fontSize:13,cursor:"pointer",fontWeight:700}}>+ 添加成员</button>
      </div>

      {/* Member tabs */}
      <div style={{display:"flex",gap:6,padding:"14px 16px 0",overflowX:"auto"}}>
        {members.map(m => (
          <button key={m.id} onClick={()=>setActiveId(m.id)}
            style={{whiteSpace:"nowrap",padding:"9px 18px",borderRadius:24,flex:"none",cursor:"pointer",
              background:m.id===activeId?"#1e3a5f":"transparent",
              border:`1.5px solid ${m.id===activeId?"#60a5fa":"#334155"}`,
              color:m.id===activeId?"#60a5fa":"#64748b",
              fontWeight:m.id===activeId?700:400,fontSize:13}}>
            {m.name}
          </button>
        ))}
        {members.length === 0 && (
          <div style={{color:"#475569",fontSize:13,padding:"10px 0"}}>还没有成员，点右上角添加</div>
        )}
      </div>

      {/* Member form */}
      {memberForm && (
        <MemberForm
          initial={memberForm === "add" ? null : memberForm}
          onSave={handleSaveMember}
          onCancel={()=>setMemberForm(null)}
          loading={loading}
        />
      )}

      {/* Member info card */}
      {!memberForm && activeMember && (
        <div style={{...S.card,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:21,background:"#0f172a",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
              {activeMember.gender==="女"?"👩":"👨"}
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:16}}>{activeMember.name}</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                {[activeMember.age&&`${activeMember.age}岁`, activeMember.gender, activeMember.weight&&`${activeMember.weight}kg`].filter(Boolean).join(" · ")}
              </div>
              {activeMember.note && <div style={{fontSize:11,color:"#475569",marginTop:2}}>📝 {activeMember.note}</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setMemberForm(activeMember)}
              style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",borderRadius:10,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>编辑</button>
            <button onClick={handleDeleteMember}
              style={{background:"#1e293b",border:"1px solid #334155",color:"#ef4444",borderRadius:10,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>删除</button>
          </div>
        </div>
      )}

      {/* ── HOME ── */}
      {!memberForm && page==="home" && (
        <>
          {latest ? (
            <div style={S.card}>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <RingGauge sys={latest.sys} dia={latest.dia} age={age} />
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>{fmt(latest.date)}</div>
                  <Badge cat={classify(latest.sys,latest.dia,age)} />
                  {latest.pulse && <div style={{fontSize:13,color:"#94a3b8",marginTop:8}}>❤️ 心率 {latest.pulse} bpm</div>}
                  {latest.note  && <div style={{fontSize:13,color:"#94a3b8",marginTop:4}}>📝 {latest.note}</div>}
                </div>
              </div>
            </div>
          ) : activeMember ? (
            <div style={{...S.card,textAlign:"center",color:"#475569",padding:"40px 20px"}}>
              <div style={{fontSize:36,marginBottom:8}}>📋</div>
              <div>暂无记录，点击下方"录入"开始吧</div>
            </div>
          ) : null}

          {advice.length > 0 && (
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:10}}>健康提示</div>
              {advice.map((a,i) => (
                <div key={i} style={{fontSize:14,color:"#e2e8f0",lineHeight:1.8,padding:"5px 0",
                  borderBottom:i<advice.length-1?"1px solid #0f172a":"none"}}>{a}</div>
              ))}
            </div>
          )}

          {records.length > 1 && (() => {
            const last7 = records.slice(0,7);
            const avgSys = Math.round(last7.reduce((a,r)=>a+r.sys,0)/last7.length);
            const avgDia = Math.round(last7.reduce((a,r)=>a+r.dia,0)/last7.length);
            return (
              <div style={{...S.card,display:"flex",justifyContent:"space-around",textAlign:"center"}}>
                <div>
                  <div style={{fontSize:22,fontWeight:800,color:"#60a5fa"}}>{avgSys}/{avgDia}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>近7次均值</div>
                </div>
                <div style={{width:1,background:"#334155"}} />
                <div>
                  <div style={{fontSize:22,fontWeight:800,color:"#a78bfa"}}>{records.length}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>总记录次数</div>
                </div>
                <div style={{width:1,background:"#334155"}} />
                <div>
                  <Badge cat={classify(avgSys,avgDia,age)} />
                  <div style={{fontSize:11,color:"#64748b",marginTop:6}}>平均评级</div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── ADD ── */}
      {!memberForm && page==="add" && (
        <div style={S.card}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:16,color:"#94a3b8"}}>为 {activeMember?.name} 录入血压</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>收缩压（高压）</div>
              <input type="number" placeholder="例：120" value={form.sys} onChange={e=>setForm(f=>({...f,sys:e.target.value}))} style={S.input} />
            </div>
            <div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>舒张压（低压）</div>
              <input type="number" placeholder="例：80" value={form.dia} onChange={e=>setForm(f=>({...f,dia:e.target.value}))} style={S.input} />
            </div>
          </div>
          <div style={{marginTop:10}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>心率（可选）</div>
            <input type="number" placeholder="例：72" value={form.pulse} onChange={e=>setForm(f=>({...f,pulse:e.target.value}))} style={S.input} />
          </div>
          <div style={{marginTop:10}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>备注（可选）</div>
            <input placeholder="例：服药后、空腹时、头晕…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={S.input} />
          </div>
          {form.sys && form.dia && parseInt(form.sys)>60 && parseInt(form.dia)>30 && (
            <div style={{marginTop:12,padding:"10px 14px",background:"#0f172a",borderRadius:12,display:"flex",alignItems:"center",gap:10}}>
              <Badge cat={classify(parseInt(form.sys),parseInt(form.dia),age)} />
              <span style={{fontSize:13,color:"#94a3b8"}}>预计分类</span>
            </div>
          )}
          <button onClick={handleSaveBP} disabled={loading} style={S.btn("#2563eb","#fff",loading)}>
            {loading?"保存中…":"保存记录"}
          </button>
          <button onClick={()=>setPage("home")} style={{...S.btn("#1e293b","#94a3b8"),border:"1px solid #334155"}}>取消</button>
        </div>
      )}

      {/* ── HISTORY ── */}
      {!memberForm && page==="history" && (
        <div style={{padding:"0 16px"}}>
          {records.length===0 && <div style={{...S.card,textAlign:"center",color:"#475569",padding:"40px 0"}}>暂无记录</div>}
          {records.map((r,i) => {
            const cat = classify(r.sys,r.dia,age);
            return (
              <div key={r.id} style={{...S.card,display:"flex",alignItems:"center",gap:12,marginTop:i===0?14:10}}>
                <div style={{width:6,height:48,borderRadius:3,background:cat.color,flexShrink:0}} />
                <div style={{flex:1}}>
                  <div style={{fontSize:20,fontWeight:800}}>{r.sys} / {r.dia} <span style={{fontSize:13,fontWeight:400,color:"#64748b"}}>mmHg</span></div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:3}}>
                    <Badge cat={cat} />
                    {r.pulse && <span style={{fontSize:12,color:"#94a3b8"}}>❤️ {r.pulse}</span>}
                  </div>
                  <div style={{fontSize:11,color:"#475569",marginTop:3}}>{fmt(r.date)}{r.note?" · "+r.note:""}</div>
                </div>
                <button onClick={()=>handleDeleteRecord(r)}
                  style={{background:"none",border:"none",color:"#475569",fontSize:18,cursor:"pointer",padding:"4px 8px"}}>🗑</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHART ── */}
      {!memberForm && page==="chart" && (
        <div style={S.card}>
          {chartData.length < 2 ? (
            <div style={{textAlign:"center",color:"#475569",padding:"40px 0"}}>至少需要2条记录才能显示趋势图</div>
          ) : (
            <>
              <div style={{fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:14}}>近期趋势（最近14次）</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{left:-20,right:10}}>
                  <XAxis dataKey="time" tick={{fontSize:9,fill:"#475569"}} interval="preserveStartEnd" />
                  <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#475569"}} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={age>=80?150:140} stroke="#ef444466" strokeDasharray="4 2" />
                  <ReferenceLine y={90} stroke="#f9731666" strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="收缩压" stroke="#60a5fa" strokeWidth={2.5} dot={{r:3,fill:"#60a5fa"}} />
                  <Line type="monotone" dataKey="舒张压" stroke="#a78bfa" strokeWidth={2.5} dot={{r:3,fill:"#a78bfa"}} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}>
                <span style={{fontSize:12,color:"#60a5fa"}}>● 收缩压</span>
                <span style={{fontSize:12,color:"#a78bfa"}}>● 舒张压</span>
                <span style={{fontSize:12,color:"#ef4444aa"}}>— 参考线{age>=80?" (80+)":""}</span>
              </div>
              <div style={{marginTop:16,borderTop:"1px solid #0f172a",paddingTop:14}}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>分类分布</div>
                {BP_CATEGORIES.map(cat => {
                  const cnt = records.filter(r=>classify(r.sys,r.dia,age).label===cat.label).length;
                  if (!cnt) return null;
                  return (
                    <div key={cat.label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <div style={{width:10,height:10,borderRadius:2,background:cat.color,flexShrink:0}} />
                      <div style={{fontSize:13,color:"#94a3b8",width:72}}>{cat.label}</div>
                      <div style={{flex:1,background:"#0f172a",borderRadius:4,overflow:"hidden",height:8}}>
                        <div style={{width:`${(cnt/records.length)*100}%`,background:cat.color,height:"100%",borderRadius:4}} />
                      </div>
                      <div style={{fontSize:12,color:"#64748b",width:28,textAlign:"right"}}>{cnt}次</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{height:90}} />

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,
        background:"#0f172a",borderTop:"1px solid #1e293b",display:"flex",justifyContent:"space-around",
        padding:"8px 0 env(safe-area-inset-bottom,8px)"}}>
        {[
          {id:"home",icon:"🏠",label:"首页"},
          {id:"add", icon:"➕",label:"录入"},
          {id:"history",icon:"📋",label:"历史"},
          {id:"chart",  icon:"📈",label:"趋势"},
        ].map(t => (
          <button key={t.id} onClick={()=>{setMemberForm(null);setPage(t.id);}} style={S.navBtn(page===t.id&&!memberForm)}>
            <span style={{fontSize:22}}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
