import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rename } from 'node:fs/promises';

/** Single-process JSON persistence. Callers must serialize read-modify-save requests. */
export function createStore(databasePath) {
  const seed = async () => {
    if (existsSync(databasePath)) return;
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
      throw new Error('Set ADMIN_PASSWORD with at least 12 characters');
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await writeFile(
      databasePath,
      JSON.stringify(
        {
          users: [
            {
              id: 'admin-1',
              name: 'Youth Med Admin',
              email: process.env.ADMIN_EMAIL || 'admin@youthmed.mn',
              role: 'admin',
              passwordHash,
              xp: 0,
              active: true,
              memberLevel: 'premium',
              paymentStatus: 'paid',
              paidAt: new Date().toISOString(),
            },
          ],
          categories: [
            { id: 'category-1', name: 'Яаралтай тусламж', color: '#FF725E' },
            { id: 'category-2', name: 'Дотор өвчин', color: '#176BFF' },
            { id: 'category-3', name: 'Эмийн аюулгүй байдал', color: '#8B5CF6' },
          ],
          tests: [
            {
              id: 'test-1',
              title: 'Шуурхай сорил',
              category: 'Яаралтай тусламж',
              questions: 3,
              imageUrl: '',
              active: true,
            },
            {
              id: 'test-2',
              title: 'Эмийн аюулгүй байдал',
              category: 'Эмийн match',
              questions: 2,
              imageUrl: '',
              active: true,
            },
          ],
          courses: [
            {
              id: 'course-1',
              title: 'Яаралтай тусламжийн үндэс',
              description: 'Том курс • 4 богино видео хичээл',
              active: true,
              lessons: [
                {
                  id: 'lesson-1',
                  title: 'ABC үнэлгээ',
                  durationMinutes: 4,
                  videoUrl: 'https://www.youtube.com/@who/videos',
                  imageUrl: '',
                  quizQuestions: 4,
                },
                {
                  id: 'lesson-2',
                  title: 'Амин үзүүлэлт',
                  durationMinutes: 3,
                  videoUrl: 'https://www.youtube.com/@who/videos',
                  imageUrl: '',
                  quizQuestions: 4,
                },
              ],
            },
          ],
          assessments: [],
        },
        null,
        2,
      ),
    );
  };
  const db = async () => {
    const data = JSON.parse(await readFile(databasePath, 'utf8'));
    data.courses ??= [];
    data.categories ??= [
      { id: 'category-1', name: 'Яаралтай тусламж', color: '#FF725E' },
      { id: 'category-2', name: 'Дотор өвчин', color: '#176BFF' },
      { id: 'category-3', name: 'Эмийн аюулгүй байдал', color: '#8B5CF6' },
    ];
    data.tests ??= [];
    data.assessments ??= [];
    return data;
  };
  const save = async (data) => {
    await writeFile(`${databasePath}.tmp`, JSON.stringify(data, null, 2));
    await rename(`${databasePath}.tmp`, databasePath);
  };

  return { db, save, seed };
}
