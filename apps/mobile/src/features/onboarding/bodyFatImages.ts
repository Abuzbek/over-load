// Body-fat figures, one per level: assets/body_fat/{M|F}-<n>pct.svg, inlined as markup.
import m3 from '../../../assets/body_fat/M-3pct.svg';
import m6 from '../../../assets/body_fat/M-6pct.svg';
import m10 from '../../../assets/body_fat/M-10pct.svg';
import m15 from '../../../assets/body_fat/M-15pct.svg';
import m20 from '../../../assets/body_fat/M-20pct.svg';
import m25 from '../../../assets/body_fat/M-25pct.svg';
import m30 from '../../../assets/body_fat/M-30pct.svg';
import m35 from '../../../assets/body_fat/M-35pct.svg';
import m40 from '../../../assets/body_fat/M-40pct.svg';
import f10 from '../../../assets/body_fat/F-10pct.svg';
import f15 from '../../../assets/body_fat/F-15pct.svg';
import f20 from '../../../assets/body_fat/F-20pct.svg';
import f25 from '../../../assets/body_fat/F-25pct.svg';
import f30 from '../../../assets/body_fat/F-30pct.svg';
import f35 from '../../../assets/body_fat/F-35pct.svg';
import f40 from '../../../assets/body_fat/F-40pct.svg';
import f45 from '../../../assets/body_fat/F-45pct.svg';
import f50 from '../../../assets/body_fat/F-50pct.svg';

/** `percent` is the figure's own level, stored as the estimate; `label` the range it stands for. */
export type BodyFatOption = { percent: number; label: string; svg: string };

/** Leanest first. The female scale runs higher: essential fat is higher for women. */
export const BODY_FAT_OPTIONS: Record<'male' | 'female', BodyFatOption[]> = {
  male: [
    { percent: 3, label: '3–4%', svg: m3 },
    { percent: 6, label: '5–7%', svg: m6 },
    { percent: 10, label: '8–12%', svg: m10 },
    { percent: 15, label: '13–17%', svg: m15 },
    { percent: 20, label: '18–22%', svg: m20 },
    { percent: 25, label: '23–27%', svg: m25 },
    { percent: 30, label: '28–32%', svg: m30 },
    { percent: 35, label: '33–37%', svg: m35 },
    { percent: 40, label: '38% +', svg: m40 },
  ],
  female: [
    { percent: 10, label: '10–12%', svg: f10 },
    { percent: 15, label: '13–17%', svg: f15 },
    { percent: 20, label: '18–22%', svg: f20 },
    { percent: 25, label: '23–27%', svg: f25 },
    { percent: 30, label: '28–32%', svg: f30 },
    { percent: 35, label: '33–37%', svg: f35 },
    { percent: 40, label: '38–42%', svg: f40 },
    { percent: 45, label: '43–47%', svg: f45 },
    { percent: 50, label: '48% +', svg: f50 },
  ],
};
