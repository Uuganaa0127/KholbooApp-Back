// Public website contract inspected at youthhealthpf.mn on 2026-10-03.
// This is a membership application API, not an identity/authentication provider.
export const regions = ['Архангай','Баян-Өлгий','Баянхонгор','Булган','Говь-Алтай','Говьсүмбэр','Дархан-Уул','Дорноговь','Дорнод','Дундговь','Завхан','Орхон','Өвөрхангай','Өмнөговь','Сүхбаатар','Сэлэнгэ','Төв','Увс','Ховд','Хөвсгөл','Хэнтий','Багануур','Багахангай','Баянгол','Баянзүрх','Налайх','Сонгинохайрхан','Сүхбаатар дүүрэг','Хан-Уул','Чингэлтэй'];
const endpoint = 'https://youthhealthpf.mn/api/data';
export function youthHealthRoutes(app, auth, upstream = fetch) {
  async function data() {
    const r = await upstream(endpoint, {signal: AbortSignal.timeout(12000)});
    if (!r.ok) throw new Error('upstream');
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error('format');
    return rows;
  }
  app.get('/api/public/membership-options', async (_req, res) => {
    try {
      const rows = await data();
      res.json({regions, committees: rows.filter(r=>r.kind==='committee').map(({id,name})=>({id,name})), khoroos: rows.filter(r=>r.kind==='khoroo').map(({id,name,region})=>({id,name,region}))});
    } catch {res.status(502).json({error:'Youth Health мэдээлэл ачаалж чадсангүй. Дахин оролдоно уу.'});}
  });
  app.get('/api/youth-health-members', auth, async (_req,res) => {
    try {
      res.json((await data()).filter(r=>r.kind==='member').map(r=>Object.fromEntries(['id','name','role','region','profession','specialty','photoUrl','committeeId','khorooId','phone'].filter(k=>r[k]!=null).map(k=>[k,r[k]]))));
    } catch {res.status(502).json({error:'Youth Health гишүүдийг ачаалж чадсангүй.'});}
  });
  app.post('/api/public/membership-applications', async (req,res) => {
    const b=req.body || {};
    const fields={name:100,email:200,role:100,specialty:200,phone:30,committeeId:200,khorooId:200};
    const payload={kind:'application',profession:b.profession,region:b.region};
    for (const [key,max] of Object.entries(fields)) {
      if (b[key]!=null && (typeof b[key]!=='string' || b[key].length>max)) return res.status(400).json({error:'Мэдээллийн урт эсвэл төрөл буруу байна.'});
      payload[key]=(b[key] || '').trim();
    }
    if(b.consent!==true || !payload.name || !payload.role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || !['doctor','nurse','student','other'].includes(b.profession) || !regions.includes(b.region)) return res.status(400).json({error:'Шаардлагатай талбар болон зөвшөөрлөө шалгана уу.'});
    if(payload.profession!=='doctor') delete payload.specialty;
    if(!regions.slice(21).includes(payload.region)) delete payload.khorooId;
    try {
      // Forward only the website's documented form fields; never tokens/passwords.
      const response=await upstream(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
      if(!response.ok) return res.status(response.status>=500?502:400).json({error:'Youth Health хүсэлтийг хүлээн авсангүй. Мэдээллээ шалгана уу.'});
      res.status(201).json({submitted:true});
    } catch {res.status(502).json({error:'Холболт тасарлаа. Хүсэлт очсон байж болзошгүй тул дахин илгээхээс өмнө Youth Health-тэй шалгана уу.'});}
  });
}
