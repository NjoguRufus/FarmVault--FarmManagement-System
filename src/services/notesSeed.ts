/**
 * Seed crops and sample library notes (developer only).
 * Call from a dev-only button or run once in dev.
 */
import {
  seedCrop,
  createLibraryNote,
} from '@/services/notesService';
import { CROP_IDS, CROP_DISPLAY_NAMES } from '@/constants/notes';

const SAMPLE_NOTES: Record<string, Array<{ category: string; title: string; content: string; highlights: string[]; tags: string[] }>> = {
  tomatoes: [
    {
      category: 'timing',
      title: 'Tomato planting window',
      content: '## Best planting period\n\nPlant **tomatoes** when night temps stay above 10°C.\n\n- Harden off seedlings for 7–10 days before transplant.\n\n> ⚠️ Avoid transplanting during hot midday; prefer overcast or evening.',
      highlights: ['Plant when nights > 10°C', 'Harden off 7–10 days', 'Transplant in evening or overcast'],
      tags: ['timing', 'transplant'],
    },
    {
      category: 'fertilizer',
      title: 'Tomato NPK basics',
      content: '## Fertilizer\n\nUse balanced **NPK** early; shift to higher **K** as fruits set.\n\n- Too much N delays fruiting.\n- Apply in split doses.',
      highlights: ['Balanced NPK early', 'Higher K at fruit set', 'Split doses'],
      tags: ['fertilizer', 'NPK'],
    },
    {
      category: 'pests-diseases',
      title: 'Tomato blight and pests',
      content: '## Pests & diseases\n\n- **Blight**: Remove affected leaves; improve airflow.\n- **Aphids**: Check undersides of leaves.\n\n> ⚠️ Do not apply chemicals without reading the label.',
      highlights: ['Blight: remove leaves, airflow', 'Aphids: check leaf undersides'],
      tags: ['blight', 'aphids'],
    },
  ],
  capsicum: [
    {
      category: 'timing',
      title: 'Capsicum transplant timing',
      content: '## Transplant\n\nTransplant **capsicum** when seedlings have 4–6 true leaves.\n\n- Keep soil warm for good root growth.',
      highlights: ['4–6 true leaves', 'Warm soil'],
      tags: ['timing', 'transplant'],
    },
    {
      category: 'general',
      title: 'Capsicum spacing',
      content: '## Spacing\n\n- **In-row**: 30–40 cm\n- **Between rows**: 60–80 cm\n\nAdjust for your variety and trellising.',
      highlights: ['30–40 cm in-row', '60–80 cm between rows'],
      tags: ['spacing', 'layout'],
    },
  ],
  watermelons: [
    {
      category: 'yield',
      title: 'Watermelon harvest cues',
      content: '## Harvest\n\n- **Tendril** near fruit dries when ripe.\n- **Ground spot** turns yellow.\n- **Sound**: dull thud when tapped.',
      highlights: ['Tendril dries', 'Ground spot yellow', 'Dull thud'],
      tags: ['harvest', 'ripeness'],
    },
  ],
  'french-beans': [
    {
      category: 'timing',
      title: 'French beans sowing',
      content: '## Sowing\n\nSow **French beans** when soil is warm (no frost risk).\n\n- Direct sow or transplant young seedlings.\n- Pick regularly to encourage more pods.',
      highlights: ['Warm soil', 'Pick regularly'],
      tags: ['sowing', 'harvest'],
    },
  ],
  maize: [
    {
      category: 'general',
      title: 'Maize planting depth',
      content: '## Planting\n\n- **Depth**: 3–5 cm in moist soil.\n- **Spacing**: 20–30 cm in row.\n\nCheck soil moisture at planting.',
      highlights: ['3–5 cm depth', '20–30 cm spacing'],
      tags: ['planting', 'spacing'],
    },
  ],
  rice: [],
};

export async function seedCropsAndNotes(createdBy: string): Promise<{ crops: number; notes: number }> {
  let cropsCount = 0;
  let notesCount = 0;

  for (const cropId of CROP_IDS) {
    const name = CROP_DISPLAY_NAMES[cropId] ?? cropId;
    await seedCrop(cropId, name);
    cropsCount++;
  }

  for (const cropId of CROP_IDS) {
    const samples = SAMPLE_NOTES[cropId] ?? [];
    for (const s of samples) {
      await createLibraryNote({
        cropId,
        category: s.category as any,
        title: s.title,
        content: s.content,
        highlights: s.highlights,
        tags: s.tags,
        status: 'published',
        createdBy,
      });
      notesCount++;
    }
  }

  return { crops: cropsCount, notes: notesCount };
}
