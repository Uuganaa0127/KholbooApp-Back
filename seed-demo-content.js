// Add sample content through the admin API without replacing existing records.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
if (!process.env.DEMO_ASSET_DIR)
  throw new Error('Set DEMO_ASSET_DIR to the Youth Med Flutter assets directory.');
const base = `http://127.0.0.1:${process.env.PORT || 4100}/api`;
let token;
async function api(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
async function upload(asset) {
  const bytes = await readFile(resolve(process.env.DEMO_ASSET_DIR, asset));
  const body = new FormData();
  body.append(
    'image',
    new Blob([bytes], { type: asset.endsWith('.jpg') ? 'image/jpeg' : 'image/png' }),
    asset,
  );
  const r = await fetch(`${base}/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d.url;
}
token = (
  await api('/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@youthmed.mn',
    password: process.env.ADMIN_PASSWORD,
  })
).token;
const existingStories = await api('/stories');
const news = [
  {
    label: 'Тавтай морил',
    title: 'Youth Med-д тавтай морил • Жишээ мэдээ',
    body: 'Курсийн замын зургаар ахицаа хараарай. Хичээлээ дуусгаж, мини тоглоом тоглон, үндсэн шалгалтаа өгөөрэй.',
    asset: 'youth_med_logo.jpg',
  },
  {
    label: 'Premium',
    title: 'Шинэ Premium курсууд • Жишээ мэдээ',
    body: 'Premium курсийг coin-оор нээх эсвэл идэвхтэй Premium гишүүнчлэлээр үзэх боломжтой. Жишээ курсуудыг Курс хэсгээс үзээрэй.',
    asset: 'anatomy_body.png',
  },
  {
    label: 'Өдрийн бонус',
    title: 'Өдөр бүр суралцъя • Жишээ мэдээ',
    body: 'Нүүр хуудасны Бонус авах товчоор өдөрт нэг удаа coin аваарай. Coin-оо хадгалж дараагийн курсээ нээгээрэй.',
    asset: 'clinical_case_vitals.png',
  },
];
for (let i = 0; i < news.length; i++) {
  const n = news[i];
  if (existingStories.some((s) => s.title === n.title)) continue;
  await api('/stories', {
    label: n.label,
    title: n.title,
    body: n.body,
    published: true,
    order: i + 1,
    imageUrl: await upload(n.asset),
  });
}
const samples = [
  {
    title: 'Youth Med эхлэх хөтөч • Жишээ',
    premium: false,
    priceCoins: 10,
    reward: 5,
    topics: ['Курсээ сонгох', 'Суралцах замын зураг', 'Ахиц ба урамшуулал'],
  },
  {
    title: 'Эмчийн харилцаа • Premium жишээ',
    premium: true,
    priceCoins: 20,
    reward: 5,
    topics: ['Ярилцлагын зорилго', 'Идэвхтэй сонсох', 'Ойлголтоо бататгах'],
  },
  {
    title: 'Судалгаа унших дадал • Premium жишээ',
    premium: true,
    priceCoins: 40,
    reward: 10,
    topics: ['Судалгааны асуулт', 'Эх сурвалжийн тэмдэглэл', 'Суралцсан зүйлээ нэгтгэх'],
  },
];
const courses = await api('/courses');
for (const sample of samples) {
  let course = courses.find((c) => c.title === sample.title);
  if (!course)
    course = await api('/courses', {
      ...sample,
      description:
        'Туршиж үзэх жишээ курс. 3 унших хичээл, ой тогтоолтын мини тоглоом, үндсэн шалгалттай. Эмнэлзүйн заавар биш.',
      active: true,
    });
  for (let i = 0; i < sample.topics.length; i++) {
    const title = sample.topics[i];
    if (course.lessons.some((l) => l.title === title)) continue;
    await api(`/courses/${course.id}/lessons`, {
      title,
      durationMinutes: 3,
      description: `${title}\n\nЭнэ бол сургалтын урсгалыг турших жишээ хичээл. Сэдвийн талаар өөрийн зорилгоо нэг өгүүлбэрээр бичиж, гол санаагаа тэмдэглээд, сурсан зүйлээ давтаарай.\n\nХичээлээ дуусгасны дараа замын зурагт тэмдэглэгээ гарна. Бүх хичээлээ дуусгаад үндсэн шалгалтаа өгнө.`,
      videoUrl: '',
      questionItems: [],
    });
  }
  if (!course.finalTest)
    await api(
      `/courses/${course.id}/test`,
      {
        title: 'Суралцах ахиц • Жишээ шалгалт',
        passPercent: 100,
        questionItems: [
          {
            prompt: 'Үндсэн шалгалт өгөхийн өмнө юу хийх вэ?',
            options: ['Бүх дэд хичээлийг дуусгах', 'Хичээлүүдийг алгасах'],
            answer: 0,
            explanation: 'Бүх дэд хичээлийг дуусгасны дараа шалгалт нээгдэнэ.',
          },
          {
            prompt: 'Курсийн coin урамшууллыг хэдэн удаа авах вэ?',
            options: ['Дахин өгөх бүрт', 'Курс бүрт нэг удаа'],
            answer: 1,
            explanation: 'Урамшууллыг нэг удаа олгоно.',
          },
        ],
      },
      'PATCH',
    );
}
console.log('Sample stories and courses are ready.');
