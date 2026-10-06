import 'dotenv/config';
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
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
token = (
  await api('/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@youthmed.mn',
    password: process.env.ADMIN_PASSWORD,
  })
).token;
const title = 'Суралцах цикл • Жишээ курс';
let c = (await api('/courses')).find((c) => c.title === title);
if (!c)
  c = await api('/courses', {
    title,
    description:
      'Pre-test → хичээл → дэд тест → post-test. Харилцааны дадлын жишээ; эмчилгээний зөвлөмж биш. Эмчийн хяналттай клиник агуулгаар орлуулах загвар.',
    reward: 10,
    premium: false,
    active: true,
  });
const questions = [
  {
    prompt: 'Мэдээлэл тодорхойгүй байвал яах вэ?',
    options: ['Таамаглан нөхөх', 'Эх сурвалжаас тодруулах'],
    answer: 1,
    explanation: 'Тодорхойгүй хэсгийг таамгаар нөхөхийн оронд эх сурвалжаас тодруулж тэмдэглэнэ.',
    topic: 'Мэдээлэл тодруулах',
    subtopic: 'Харилцаа',
    difficulty: 'easy',
    skill: 'Мэдээллийн чанар',
  },
  {
    prompt: 'Тохирсон ажлыг хэрхэн тэмдэглэх вэ?',
    options: ['Хэн, юуг, хэзээ хийхийг тэмдэглэх', 'Зөвхөн сэдвийн нэр бичих'],
    answer: 0,
    explanation:
      'Хариуцах хүн, үйлдэл болон хугацааг хамт тэмдэглэх нь дараагийн алхмыг ойлгомжтой болгоно.',
    topic: 'Мэдээлэл тодруулах',
    difficulty: 'easy',
    skill: 'Багийн харилцаа',
  },
];
if (!c.preTest)
  await api(
    `/courses/${c.id}/pre-test`,
    { title: 'Эхний мэдлэг • Жишээ', questionItems: questions },
    'PATCH',
  );
if (!c.lessons?.length)
  await api(`/courses/${c.id}/lessons`, {
    title: 'Мэдээллийг тодруулж нэгтгэх',
    description:
      '1. Тодорхойгүй мэдээллийг таамгаар нөхөхгүй, эх сурвалжаас тодруулна.\n2. Ажлын төгсгөлд хэн, юуг, хэзээ хийхийг нэгтгэнэ.\nЖишээ дадлага: багийн уулзалтын дараах тэмдэглэлдээ энэ гурван хэсгийг оруулна уу.',
    durationMinutes: 2,
    questionItems: questions,
  });
if (!c.finalTest)
  await api(
    `/courses/${c.id}/test`,
    {
      title: 'Дараах мэдлэг • Жишээ',
      passPercent: 80,
      questionItems: questions.map((q) => ({ ...q, prompt: `Давтан шалгах: ${q.prompt}` })),
    },
    'PATCH',
  );
console.log(
  'Sample learning-cycle course is ready. Existing content and learner progress were preserved.',
);
