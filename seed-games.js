import 'dotenv/config';
const base=`http://127.0.0.1:${process.env.PORT||4100}/api`;let token;
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
token=(await api('/auth/login',{email:process.env.ADMIN_EMAIL||'admin@youthmed.mn',password:process.env.ADMIN_PASSWORD})).token;
const current=await api('/games');
const games=[{title:'Хосоо олоорой',description:'Ой тогтоолтын дасгал • ижил нэртэй картыг олоорой.',type:'memory',items:['Хүүхэд','Мэс засал','Дүрс оношилгоо','Дотор өвчин']},{title:'Суралцах дараалал',description:'Сургалтын мөчлөгийн алхмуудыг эвлүүлээрэй.',type:'sequence',items:['Анхны мэдлэгээ шалгах','Хичээлээ үзэх','Дадлага хийх','Дараах мэдлэгээ шалгах','Товлосон давтлага хийх']},{title:'Мэдээллийн чанар • Богино сорил',description:'Харилцааны дадлын жишээ асуулт.',type:'quiz',questionItems:[{prompt:'Тодорхойгүй мэдээллийг яах вэ?',options:['Таамгаар нөхөх','Эх сурвалжаас тодруулах'],answer:1,explanation:'Мэдээллийг эх сурвалжаас тодруулж тэмдэглэнэ.'},{prompt:'Тохирсон ажлыг хэрхэн бичих вэ?',options:['Хэн, юуг, хэзээ хийх','Зөвхөн гарчиг'],answer:0,explanation:'Хариуцах хүн, үйлдэл, хугацааг хамт тэмдэглэнэ.'}]}];
for(const g of games)if(!current.some(x=>x.title===g.title))await api('/games',{...g,active:true});
console.log('Three editable sample mini-games are available.');
